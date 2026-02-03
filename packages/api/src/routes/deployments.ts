import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { buildQueue } from '../lib/queue.js';
import { AppError } from '../middleware/errorHandler.js';
import type { DeploymentJobData } from '@renderlite/shared';

export const deploymentRouter = Router();

// All routes require authentication
deploymentRouter.use(authenticate);

// List deployments (optionally filter by service)
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

// Trigger new deployment
deploymentRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { serviceId } = req.body;

    if (!serviceId) {
      throw new AppError('serviceId is required', 400);
    }

    // Verify service ownership
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

    // Create deployment record
    const deployment = await prisma.deployment.create({
      data: {
        serviceId,
        status: 'QUEUED',
      },
    });

    // Update service status
    await prisma.service.update({
      where: { id: serviceId },
      data: { status: 'DEPLOYING' },
    });

    // Parse env vars from JSON
    let envVars: Record<string, string> | undefined;
    if (service.envVars) {
      envVars = service.envVars as Record<string, string>;
    }

    // Add job to queue
    const jobData: DeploymentJobData = {
      deploymentId: deployment.id,
      serviceId: service.id,
      repoUrl: service.repoUrl,
      branch: service.branch,
      subdomain: service.subdomain,
      envVars,
    };

    await buildQueue.add(`deploy-${deployment.id}`, jobData, {
      jobId: deployment.id,
    });

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

// Cancel deployment (if still queued)
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

    if (deployment.status !== 'QUEUED') {
      throw new AppError('Can only cancel queued deployments', 400);
    }

    // Remove from queue
    const job = await buildQueue.getJob(deployment.id);
    if (job) {
      await job.remove();
    }

    // Update status
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'FAILED', logs: 'Deployment cancelled by user' },
    });

    res.json({ message: 'Deployment cancelled' });
  } catch (error) {
    next(error);
  }
});
