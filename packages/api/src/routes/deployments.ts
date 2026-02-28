import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { buildQueue, rollbackQueue } from '../lib/queue.js';
import { AppError } from '../middleware/errorHandler.js';
import type { DeploymentJobData, RollbackJobData } from '@renderlite/shared';
import { DeploymentStatus, ServiceStatus } from '@renderlite/shared';
import { decryptEnvVars, decrypt } from '../utils/encryption.js';
import type { SocketHandlers } from '../socket/index.js';

export const deploymentRouter = Router();

deploymentRouter.use(authenticate);

// List deployments
deploymentRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { serviceId } = req.query;

    const deployments = await prisma.deployment.findMany({
      where: {
        service: {
          project: {
            userId: req.user!.id,
          },
          ...(serviceId && { id: serviceId as string }),
        },
      },
      include: {
        service: {
          select: { id: true, name: true, subdomain: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(deployments);
  } catch (error) {
    next(error);
  }
});

// Get single deployment
deploymentRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const deployment = await prisma.deployment.findFirst({
      where: {
        id: req.params.id,
        service: {
          project: {
            userId: req.user!.id,
          },
        },
      },
      include: {
        service: {
          select: { id: true, name: true, subdomain: true, repoUrl: true, branch: true },
        },
      },
    });

    if (!deployment) {
      throw new AppError('Deployment not found', 404);
    }

    res.json(deployment);
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: build job data for a deployment, including token and health check config
 */
async function buildDeploymentJobData(
  service: any,
  deploymentId: string,
  userId: string
): Promise<DeploymentJobData> {
  let envVars: Record<string, string> | undefined;
  if (service.envVars) {
    envVars = decryptEnvVars(service.envVars as Record<string, string>);
  }

  let githubToken: string | undefined;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });
  if (user?.githubAccessToken) {
    try {
      githubToken = decrypt(user.githubAccessToken);
    } catch {
      // token not available or corrupted
    }
  }

  return {
    deploymentId,
    serviceId: service.id,
    repoUrl: service.repoUrl,
    branch: service.branch,
    subdomain: service.subdomain,
    envVars,
    githubToken,
    healthCheckPath: service.healthCheckPath ?? undefined,
    healthCheckInterval: service.healthCheckInterval,
    healthCheckTimeout: service.healthCheckTimeout,
  };
}

// Trigger new deployment
deploymentRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { serviceId } = req.body;

    if (!serviceId) {
      throw new AppError('serviceId is required', 400);
    }

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        project: {
          userId: req.user!.id,
        },
      },
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    const deployment = await prisma.deployment.create({
      data: {
        serviceId,
        status: DeploymentStatus.QUEUED,
      },
    });

    await prisma.service.update({
      where: { id: serviceId },
      data: { status: ServiceStatus.DEPLOYING },
    });

    const jobData = await buildDeploymentJobData(service, deployment.id, req.user!.id);

    await buildQueue.add(`deploy-${deployment.id}`, jobData, {
      jobId: deployment.id,
    });

    const socketHandlers = req.app.get('socketHandlers') as SocketHandlers | undefined;
    socketHandlers?.emitDeploymentStatus(deployment.id, DeploymentStatus.QUEUED);
    socketHandlers?.emitServiceStatus(service.id, ServiceStatus.DEPLOYING);

    res.status(201).json(deployment);
  } catch (error) {
    next(error);
  }
});

// Get deployment logs
deploymentRouter.get('/:id/logs', async (req: AuthRequest, res, next) => {
  try {
    const deployment = await prisma.deployment.findFirst({
      where: {
        id: req.params.id,
        service: {
          project: {
            userId: req.user!.id,
          },
        },
      },
      select: {
        id: true,
        logs: true,
        status: true,
      },
    });

    if (!deployment) {
      throw new AppError('Deployment not found', 404);
    }

    res.json({
      id: deployment.id,
      status: deployment.status,
      logs: deployment.logs || '',
    });
  } catch (error) {
    next(error);
  }
});

// Cancel deployment
deploymentRouter.post('/:id/cancel', async (req: AuthRequest, res, next) => {
  try {
    const deployment = await prisma.deployment.findFirst({
      where: {
        id: req.params.id,
        service: {
          project: {
            userId: req.user!.id,
          },
        },
      },
    });

    if (!deployment) {
      throw new AppError('Deployment not found', 404);
    }

    if (deployment.status !== DeploymentStatus.QUEUED) {
      throw new AppError('Can only cancel queued deployments', 400);
    }

    const job = await buildQueue.getJob(deployment.id);
    if (job) {
      await job.remove();
    }

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.FAILED,
        logs: 'Deployment cancelled by user',
        finishedAt: new Date(),
      },
    });

    await prisma.service.update({
      where: { id: deployment.serviceId },
      data: { status: ServiceStatus.FAILED },
    });

    const socketHandlers = req.app.get('socketHandlers') as SocketHandlers | undefined;
    socketHandlers?.emitDeploymentStatus(deployment.id, DeploymentStatus.FAILED);
    socketHandlers?.emitServiceStatus(deployment.serviceId, ServiceStatus.FAILED);

    res.json({ message: 'Deployment cancelled' });
  } catch (error) {
    next(error);
  }
});

// Rollback to a previous successful deployment
deploymentRouter.post('/:id/rollback', async (req: AuthRequest, res, next) => {
  try {
    const targetDeployment = await prisma.deployment.findFirst({
      where: {
        id: req.params.id,
        service: {
          project: {
            userId: req.user!.id,
          },
        },
      },
      include: {
        service: true,
      },
    });

    if (!targetDeployment) {
      throw new AppError('Deployment not found', 404);
    }

    if (targetDeployment.status !== DeploymentStatus.SUCCESS) {
      throw new AppError('Can only rollback to successful deployments', 400);
    }

    if (!targetDeployment.imageTag) {
      throw new AppError('Deployment has no image tag -- cannot rollback', 400);
    }

    const service = targetDeployment.service;

    const newDeployment = await prisma.deployment.create({
      data: {
        serviceId: service.id,
        status: DeploymentStatus.QUEUED,
        commitSha: targetDeployment.commitSha,
        imageTag: targetDeployment.imageTag,
      },
    });

    await prisma.service.update({
      where: { id: service.id },
      data: { status: ServiceStatus.DEPLOYING },
    });

    let envVars: Record<string, string> | undefined;
    if (service.envVars) {
      envVars = decryptEnvVars(service.envVars as Record<string, string>);
    }

    const rollbackData: RollbackJobData = {
      deploymentId: newDeployment.id,
      serviceId: service.id,
      subdomain: service.subdomain,
      imageTag: targetDeployment.imageTag,
      envVars,
      healthCheckPath: service.healthCheckPath ?? undefined,
      healthCheckInterval: service.healthCheckInterval,
      healthCheckTimeout: service.healthCheckTimeout,
    };

    await rollbackQueue.add(`rollback-${newDeployment.id}`, rollbackData, {
      jobId: newDeployment.id,
    });

    const socketHandlers = req.app.get('socketHandlers') as SocketHandlers | undefined;
    socketHandlers?.emitDeploymentStatus(newDeployment.id, DeploymentStatus.QUEUED);
    socketHandlers?.emitServiceStatus(service.id, ServiceStatus.DEPLOYING);

    res.status(201).json(newDeployment);
  } catch (error) {
    next(error);
  }
});
