import { NextFunction, Request, Response, Router } from 'express';
import passport from 'passport';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import crypto from 'crypto';
import { isGitHubOAuthConfigured } from '../config/passport.js';

export const authRouter = Router();

function isDevAuthEnabled(): boolean {
  return process.env.DEV_AUTH_ENABLED === 'true';
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

// GitHub OAuth initiation
authRouter.get(
  '/github',
  ensureGitHubOAuthConfigured,
  passport.authenticate('github', { session: false })
);

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

    const email = process.env.DEV_AUTH_EMAIL || 'dev@renderlite.local';
    const username = process.env.DEV_AUTH_USERNAME || 'dev-user';
    const githubId = `dev-${crypto
      .createHash('sha256')
      .update(email.toLowerCase())
      .digest('hex')
      .slice(0, 24)}`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { username, avatarUrl: null },
      create: {
        email,
        username,
        githubId,
        avatarUrl: null,
      },
    });

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
