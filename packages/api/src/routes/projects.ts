import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export const projectRouter = Router();

// All routes require authentication
projectRouter.use(authenticate);

// List all projects for current user
projectRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user!.id },
      include: {
        _count: {
          select: { services: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Get single project
projectRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      include: {
        services: {
          include: {
            _count: {
              select: { deployments: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Create project
projectRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      throw new AppError('Project name is required', 400);
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        userId: req.user!.id,
      },
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Update project
projectRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      throw new AppError('Project name is required', 400);
    }

    // Verify ownership
    const existing = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    });

    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Delete project
projectRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    // Verify ownership
    const existing = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    await prisma.project.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
