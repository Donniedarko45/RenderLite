import { NextFunction, Request, Response, Router } from 'express';
import passport from 'passport';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import crypto from 'crypto';
import { isGitHubOAuthConfigured } from '../config/passport.js';

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export const authRouter = Router();

function syncEnvFromRoot() {
  try {
    const candidates = [
      path.resolve(process.cwd(), '../../.env'),
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../.env'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p, override: true });
        break;
      }
    }
  } catch {
    // ignore
  }
}

export function isDevAuthEnabled(): boolean {
  syncEnvFromRoot();
  if (process.env.DEV_AUTH_ENABLED === 'true' || process.env.SKIP_AUTH === 'true') {
    return true;
  }
  // In local development, if GitHub OAuth is not configured, automatically enable dummy dev auth
  if (process.env.NODE_ENV !== 'production' && !isGitHubOAuthConfigured()) {
    return true;
  }
  return false;
}

export async function getOrCreateDevUser() {
  const email = process.env.DEV_AUTH_EMAIL || 'dev@renderlite.local';
  const username = process.env.DEV_AUTH_USERNAME || 'dev-user';
  const githubId = `dev-${crypto
    .createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex')
    .slice(0, 24)}`;

  return await prisma.user.upsert({
    where: { email },
    update: { username, avatarUrl: null },
    create: {
      email,
      username,
      githubId,
      avatarUrl: null,
    },
  });
}

function ensureGitHubOAuthConfigured(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!isGitHubOAuthConfigured()) {
    return res.status(503).json({
      error: 'GitHub OAuth is not configured on this server',
      hint: 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET or use dev login',
    });
  }
  next();
}

// Auth config endpoint for frontend detection
authRouter.get('/config', (req, res) => {
  res.json({
    gitHubOAuthConfigured: isGitHubOAuthConfigured(),
    devAuthEnabled: isDevAuthEnabled(),
    skipAuth: process.env.SKIP_AUTH === 'true',
  });
});

// GitHub OAuth initiation (gracefully redirects with dummy token in dev mode if OAuth is not configured)
authRouter.get('/github', async (req: Request, res: Response, next: NextFunction) => {
  if (!isGitHubOAuthConfigured()) {
    if (isDevAuthEnabled()) {
      try {
        const user = await getOrCreateDevUser();
        const token = generateToken({
          userId: user.id,
          email: user.email,
          username: user.username,
        });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
      } catch (error) {
        return next(error);
      }
    }
    return res.status(503).json({
      error: 'GitHub OAuth is not configured on this server',
      hint: 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET or use dev login',
    });
  }

  passport.authenticate('github', { session: false })(req, res, next);
});

// GitHub OAuth callback
authRouter.get(
  '/github/callback',
  ensureGitHubOAuthConfigured,
  passport.authenticate('github', { session: false, failureRedirect: '/auth/failure' }),
  (req, res) => {
    const user = req.user as any;
    
    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
);

// Development-only auth bypass
authRouter.post('/dev-login', async (req, res) => {
  try {
    if (!isDevAuthEnabled()) {
      return res.status(404).json({ error: 'Not found' });
    }

    const user = await getOrCreateDevUser();
    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Dev login failed' });
  }
});

// Auth failure
authRouter.get('/failure', (req, res) => {
  res.status(401).json({ error: 'Authentication failed' });
});

// Get current user
authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: { projects: true },
        },
      },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Logout (client-side token removal, but we can track it)
authRouter.post('/logout', authenticate, (req: AuthRequest, res) => {
  res.json({ message: 'Logged out successfully' });
});
