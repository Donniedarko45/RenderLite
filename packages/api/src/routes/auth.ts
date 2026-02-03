import { Router } from 'express';
import passport from 'passport';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

// GitHub OAuth initiation
authRouter.get('/github', passport.authenticate('github', { session: false }));

// GitHub OAuth callback
authRouter.get(
  '/github/callback',
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
