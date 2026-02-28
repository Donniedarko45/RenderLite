import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { buildQueue } from '../lib/queue.js';
import { DeploymentStatus, ServiceStatus } from '@renderlite/shared';
import type { DeploymentJobData } from '@renderlite/shared';
import { decryptEnvVars, decrypt } from '../utils/encryption.js';
import type { SocketHandlers } from '../socket/index.js';

export const webhookRouter = Router();

function verifyGitHubSignature(
  payload: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * GitHub webhook endpoint -- public (no JWT auth).
 * Expects raw body for HMAC signature verification.
 */
webhookRouter.post('/github/:serviceId', async (req: Request, res: Response) => {
  try {
    const { serviceId } = req.params;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const event = req.headers['x-github-event'] as string | undefined;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        project: {
          select: { userId: true },
        },
      },
    });

    if (!service || !service.webhookSecret) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing request body' });
    }

    if (!verifyGitHubSignature(rawBody, signature, service.webhookSecret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (event !== 'push') {
      return res.status(204).send();
    }

    const payload = JSON.parse(rawBody.toString());
    const ref: string = payload.ref || '';
    const branch = ref.replace('refs/heads/', '');

    if (branch !== service.branch) {
      return res.status(204).send();
    }

    // Trigger deployment
    const deployment = await prisma.deployment.create({
      data: {
        serviceId: service.id,
        status: DeploymentStatus.QUEUED,
        commitSha: payload.after?.substring(0, 40) || null,
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

    let githubToken: string | undefined;
    const user = await prisma.user.findUnique({
      where: { id: service.project.userId },
      select: { githubAccessToken: true },
    });
    if (user?.githubAccessToken) {
      try {
        githubToken = decrypt(user.githubAccessToken);
      } catch { /* ignore */ }
    }

    const jobData: DeploymentJobData = {
      deploymentId: deployment.id,
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

    await buildQueue.add(`deploy-${deployment.id}`, jobData, {
      jobId: deployment.id,
    });

    const socketHandlers = req.app.get('socketHandlers') as SocketHandlers | undefined;
    socketHandlers?.emitDeploymentStatus(deployment.id, DeploymentStatus.QUEUED);
    socketHandlers?.emitServiceStatus(service.id, ServiceStatus.DEPLOYING);

    res.status(200).json({
      message: 'Deployment triggered',
      deploymentId: deployment.id,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
