import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '../lib/prisma.js';

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
  );
}

export function configurePassport() {
  if (!isGitHubOAuthConfigured()) {
    console.warn('GitHub OAuth disabled: missing GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET');
    return;
  }

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback',
        scope: ['user:email', 'read:user'],
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (err: any, user?: any) => void
      ) => {
        try {
          const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
          
          // Find or create user
          let user = await prisma.user.findUnique({
            where: { githubId: profile.id },
          });

          if (!user) {
            user = await prisma.user.create({
              data: {
                githubId: profile.id,
                email,
                username: profile.username,
                avatarUrl: profile.photos?.[0]?.value,
              },
            });
          } else {
            // Update user info on each login
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                email,
                username: profile.username,
                avatarUrl: profile.photos?.[0]?.value,
              },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}
