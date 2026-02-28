import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import { MemberRole } from '@renderlite/shared';

/**
 * Look up the user's role in an organization.
 * Returns null if the user is not a member.
 */
export async function getUserRoleInOrg(
  userId: string,
  organizationId: string
): Promise<MemberRole | null> {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId },
    },
  });
  return (membership?.role as MemberRole) ?? null;
}

/**
 * Middleware factory: require the user to have one of the specified roles
 * in the organization identified by req.params.id.
 */
export function requireOrgRole(...roles: MemberRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.id || req.params.organizationId;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400);
      }

      const role = await getUserRoleInOrg(req.user!.id, orgId);
      if (!role || !roles.includes(role)) {
        throw new AppError('Insufficient permissions', 403);
      }

      (req as any).orgRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if a user has access to a project -- either they own it directly
 * or they are a member of the organization that owns it.
 */
export async function canAccessProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, organizationId: true },
  });

  if (!project) return false;

  if (project.userId === userId) return true;

  if (project.organizationId) {
    const role = await getUserRoleInOrg(userId, project.organizationId);
    return role !== null;
  }

  return false;
}

/**
 * Middleware: require the user to have access to the project identified by
 * req.params.projectId or req.body.projectId.
 */
export async function requireProjectAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = req.params.projectId || req.body?.projectId;
    if (!projectId) {
      throw new AppError('Project ID is required', 400);
    }

    const hasAccess = await canAccessProject(req.user!.id, projectId);
    if (!hasAccess) {
      throw new AppError('Project not found or access denied', 404);
    }

    next();
  } catch (error) {
    next(error);
  }
}
