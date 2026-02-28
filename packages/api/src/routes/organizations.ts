import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { getUserRoleInOrg } from '../middleware/permissions.js';
import { MemberRole } from '@renderlite/shared';

export const organizationRouter = Router();

organizationRouter.use(authenticate);

// List organizations the user belongs to
organizationRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user!.id },
      include: {
        organization: {
          include: {
            _count: { select: { memberships: true, projects: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      memberships.map((m) => ({
        ...m.organization,
        role: m.role,
      }))
    );
  } catch (error) {
    next(error);
  }
});

// Get organization detail
organizationRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const role = await getUserRoleInOrg(req.user!.id, req.params.id);
    if (!role) {
      throw new AppError('Organization not found', 404);
    }

    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, email: true, username: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        projects: {
          include: {
            _count: { select: { services: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { memberships: true, projects: true } },
      },
    });

    res.json({ ...org, currentUserRole: role });
  } catch (error) {
    next(error);
  }
});

// Create organization
organizationRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name, slug } = req.body;

    if (!name || !slug) {
      throw new AppError('name and slug are required', 400);
    }

    const slugPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!slugPattern.test(slug)) {
      throw new AppError('slug must be lowercase alphanumeric with dashes', 400);
    }

    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new AppError('An organization with this slug already exists', 409);
    }

    const org = await prisma.organization.create({
      data: {
        name: name.trim(),
        slug: slug.toLowerCase(),
        ownerId: req.user!.id,
        memberships: {
          create: {
            userId: req.user!.id,
            role: MemberRole.OWNER,
          },
        },
      },
      include: {
        _count: { select: { memberships: true, projects: true } },
      },
    });

    res.status(201).json({ ...org, role: MemberRole.OWNER });
  } catch (error) {
    next(error);
  }
});

// Update organization (OWNER or ADMIN)
organizationRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const role = await getUserRoleInOrg(req.user!.id, req.params.id);
    if (!role || ![MemberRole.OWNER, MemberRole.ADMIN].includes(role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const { name } = req.body;
    if (!name) {
      throw new AppError('name is required', 400);
    }

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    });

    res.json(org);
  } catch (error) {
    next(error);
  }
});

// Delete organization (OWNER only)
organizationRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const role = await getUserRoleInOrg(req.user!.id, req.params.id);
    if (role !== MemberRole.OWNER) {
      throw new AppError('Only the owner can delete an organization', 403);
    }

    await prisma.organization.delete({ where: { id: req.params.id } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Invite member (OWNER or ADMIN)
organizationRouter.post('/:id/members', async (req: AuthRequest, res, next) => {
  try {
    const role = await getUserRoleInOrg(req.user!.id, req.params.id);
    if (!role || ![MemberRole.OWNER, MemberRole.ADMIN].includes(role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const { email, role: memberRole } = req.body;

    if (!email) {
      throw new AppError('email is required', 400);
    }

    const validRoles = [MemberRole.ADMIN, MemberRole.MEMBER, MemberRole.VIEWER];
    if (memberRole && !validRoles.includes(memberRole)) {
      throw new AppError('Invalid role', 400);
    }

    // Only OWNER can add ADMINs
    if (memberRole === MemberRole.ADMIN && role !== MemberRole.OWNER) {
      throw new AppError('Only the owner can add admins', 403);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError('User not found with that email', 404);
    }

    const existing = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: req.params.id,
        },
      },
    });
    if (existing) {
      throw new AppError('User is already a member', 409);
    }

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: req.params.id,
        role: memberRole || MemberRole.MEMBER,
      },
      include: {
        user: {
          select: { id: true, email: true, username: true, avatarUrl: true },
        },
      },
    });

    res.status(201).json(membership);
  } catch (error) {
    next(error);
  }
});

// Change member role (OWNER only)
organizationRouter.put('/:id/members/:userId', async (req: AuthRequest, res, next) => {
  try {
    const role = await getUserRoleInOrg(req.user!.id, req.params.id);
    if (role !== MemberRole.OWNER) {
      throw new AppError('Only the owner can change roles', 403);
    }

    const { role: newRole } = req.body;
    if (!newRole || !Object.values(MemberRole).includes(newRole)) {
      throw new AppError('Valid role is required', 400);
    }

    if (req.params.userId === req.user!.id) {
      throw new AppError('Cannot change your own role', 400);
    }

    const membership = await prisma.membership.update({
      where: {
        userId_organizationId: {
          userId: req.params.userId,
          organizationId: req.params.id,
        },
      },
      data: { role: newRole },
      include: {
        user: {
          select: { id: true, email: true, username: true, avatarUrl: true },
        },
      },
    });

    res.json(membership);
  } catch (error) {
    next(error);
  }
});

// Remove member (OWNER or ADMIN, cannot remove OWNER)
organizationRouter.delete('/:id/members/:userId', async (req: AuthRequest, res, next) => {
  try {
    const callerRole = await getUserRoleInOrg(req.user!.id, req.params.id);
    if (!callerRole || ![MemberRole.OWNER, MemberRole.ADMIN].includes(callerRole)) {
      throw new AppError('Insufficient permissions', 403);
    }

    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.params.userId,
          organizationId: req.params.id,
        },
      },
    });

    if (!targetMembership) {
      throw new AppError('Member not found', 404);
    }

    if (targetMembership.role === MemberRole.OWNER) {
      throw new AppError('Cannot remove the organization owner', 400);
    }

    if (targetMembership.role === MemberRole.ADMIN && callerRole !== MemberRole.OWNER) {
      throw new AppError('Only the owner can remove admins', 403);
    }

    await prisma.membership.delete({
      where: { id: targetMembership.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
