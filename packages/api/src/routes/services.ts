import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateSubdomain } from '../utils/subdomain.js';
import { encryptEnvVars } from '../utils/encryption.js';
import Docker from 'dockerode';

export const serviceRouter = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function normalizeAndEncryptEnvVars(rawEnvVars: unknown): Record<string, string> | null {
  if (rawEnvVars === null || rawEnvVars === undefined) {
    return null;
  }

  if (typeof rawEnvVars !== 'object' || Array.isArray(rawEnvVars)) {
    throw new AppError('envVars must be a key-value object', 400);
  }

  const envVars = Object.entries(rawEnvVars as Record<string, unknown>).reduce(
    (acc, [key, value]) => {
      if (typeof key !== 'string' || !key.trim()) {
        return acc;
      }
      acc[key.trim()] = value === undefined || value === null ? '' : String(value);
      return acc;
    },
    {} as Record<string, string>
  );

  if (Object.keys(envVars).length === 0) {
    return null;
  }

  try {
    return encryptEnvVars(envVars);
  } catch (error) {
    throw new AppError('Failed to encrypt environment variables', 500);
  }
}

function maskEnvVars(rawEnvVars: unknown): Record<string, string> | null {
  if (!rawEnvVars || typeof rawEnvVars !== 'object' || Array.isArray(rawEnvVars)) {
    return null;
  }

  const masked = Object.keys(rawEnvVars as Record<string, unknown>).reduce(
    (acc, key) => {
      acc[key] = '********';
      return acc;
    },
    {} as Record<string, string>
  );

  return Object.keys(masked).length > 0 ? masked : null;
}

// All routes require authentication
serviceRouter.use(authenticate);

// List services (optionally filter by project)
serviceRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { projectId } = req.query;

    const services = await prisma.service.findMany({
      where: {
        project: {
          userId: req.user!.id,
          ...(projectId && { id: projectId as string }),
        },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
        _count: {
          select: { deployments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      services.map((service) => ({
        ...service,
        envVars: maskEnvVars(service.envVars),
      }))
    );
  } catch (error) {
    next(error);
  }
});

// Get single service
serviceRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const service = await prisma.service.findFirst({
      where: {
        id: req.params.id,
        project: {
          userId: req.user!.id,
        },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    res.json({
      ...service,
      envVars: maskEnvVars(service.envVars),
    });
  } catch (error) {
    next(error);
  }
});

// Create service
serviceRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name, projectId, repoUrl, branch, runtime, envVars } = req.body;

    // Validate required fields
    if (!name || !projectId || !repoUrl) {
      throw new AppError('Name, projectId, and repoUrl are required', 400);
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user!.id,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    // Validate GitHub URL
    const githubUrlPattern = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/;
    if (!githubUrlPattern.test(repoUrl)) {
      throw new AppError('Invalid GitHub repository URL', 400);
    }

    // Generate unique subdomain
    const subdomain = await generateSubdomain(name);

    const encryptedEnvVars =
      envVars !== undefined ? normalizeAndEncryptEnvVars(envVars) : null;

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        projectId,
        repoUrl: repoUrl.replace(/\.git$/, ''),
        branch: branch || 'main',
        runtime: runtime || null,
        subdomain,
        envVars: encryptedEnvVars,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      ...service,
      envVars: maskEnvVars(service.envVars),
    });
  } catch (error) {
    next(error);
  }
});

// Update service
serviceRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { name, branch, runtime, envVars } = req.body;

    // Verify ownership
    const existing = await prisma.service.findFirst({
      where: {
        id: req.params.id,
        project: {
          userId: req.user!.id,
        },
      },
    });

    if (!existing) {
      throw new AppError('Service not found', 404);
    }

    const encryptedEnvVars =
      envVars !== undefined ? normalizeAndEncryptEnvVars(envVars) : undefined;

    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(branch && { branch }),
        ...(runtime !== undefined && { runtime }),
        ...(envVars !== undefined && { envVars: encryptedEnvVars }),
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      ...service,
      envVars: maskEnvVars(service.envVars),
    });
  } catch (error) {
    next(error);
  }
});

// Delete service
serviceRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const existing = await prisma.service.findFirst({
      where: {
        id: req.params.id,
        project: {
          userId: req.user!.id,
        },
      },
    });

    if (!existing) {
      throw new AppError('Service not found', 404);
    }

    if (existing.containerId) {
      try {
        const container = docker.getContainer(existing.containerId);
        try {
          await container.stop({ t: 10 });
        } catch (stopError: any) {
          if (!stopError?.statusCode || stopError.statusCode !== 304) {
            throw stopError;
          }
        }
        await container.remove({ force: true });
      } catch (dockerError: any) {
        if (dockerError?.statusCode !== 404) {
          throw dockerError;
        }
      }
    }

    await prisma.service.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
