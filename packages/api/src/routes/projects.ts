import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getUserRoleInOrg, canAccessProject } from '../middleware/permissions.js';

export const projectRouter = Router();

projectRouter.use(authenticate);

// List all projects the user can access (own + org projects)
projectRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { organizationId } = req.query;

    if (organizationId) {
      const role = await getUserRoleInOrg(req.user!.id, organizationId as string);
      if (!role) {
        throw new AppError('Organization not found', 404);
      }

      const projects = await prisma.project.findMany({
        where: { organizationId: organizationId as string },
        include: {
          _count: { select: { services: true } },
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(projects);
    }

    // Personal projects + projects from orgs the user belongs to
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user!.id },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { userId: req.user!.id },
          ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        ],
      },
      include: {
        _count: { select: { services: true } },
        organization: { select: { id: true, name: true, slug: true } },
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
    const hasAccess = await canAccessProject(req.user!.id, req.params.id);
    if (!hasAccess) {
      throw new AppError('Project not found', 404);
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        services: {
          select: {
            id: true,
            name: true,
            projectId: true,
            repoUrl: true,
            branch: true,
            runtime: true,
            subdomain: true,
            status: true,
            containerId: true,
            createdAt: true,
            updatedAt: true,
            deployments: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                id: true,
                status: true,
                commitSha: true,
                createdAt: true,
              },
            },
            _count: {
              select: { deployments: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        databases: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            createdAt: true,
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

// Create project (personal or under an organization)
projectRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name, organizationId } = req.body;

    if (!name || typeof name !== 'string') {
      throw new AppError('Project name is required', 400);
    }

    if (organizationId) {
      const role = await getUserRoleInOrg(req.user!.id, organizationId);
      if (!role) {
        throw new AppError('Organization not found or access denied', 404);
      }
      const viewerOnly = role === 'VIEWER';
      if (viewerOnly) {
        throw new AppError('Viewers cannot create projects', 403);
      }
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        userId: req.user!.id,
        organizationId: organizationId || null,
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

    const hasAccess = await canAccessProject(req.user!.id, req.params.id);
    if (!hasAccess) {
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
    const existing = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { userId: true, organizationId: true },
    });

    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    // Only the project owner or org OWNER/ADMIN can delete
    if (existing.userId !== req.user!.id) {
      if (!existing.organizationId) {
        throw new AppError('Project not found', 404);
      }
      const role = await getUserRoleInOrg(req.user!.id, existing.organizationId);
      if (!role || !['OWNER', 'ADMIN'].includes(role)) {
        throw new AppError('Insufficient permissions', 403);
      }
    }

    await prisma.project.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
