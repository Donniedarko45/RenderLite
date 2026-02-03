import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateSubdomain } from '../utils/subdomain.js';

export const serviceRouter = Router();

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

    res.json(services);
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

    res.json(service);
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

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        projectId,
        repoUrl: repoUrl.replace(/\.git$/, ''),
        branch: branch || 'main',
        runtime: runtime || null,
        subdomain,
        envVars: envVars || null,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json(service);
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

    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(branch && { branch }),
        ...(runtime !== undefined && { runtime }),
        ...(envVars !== undefined && { envVars }),
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(service);
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

    // TODO: Stop and remove container if running

    await prisma.service.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
