import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateSubdomain } from '../utils/subdomain.js';
import { decrypt, encryptEnvVars } from '../utils/encryption.js';
import Docker from 'dockerode';

export const serviceRouter = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const GITHUB_API_BASE_URL = 'https://api.github.com';

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
};

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

async function getGitHubAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });

  if (!user?.githubAccessToken) {
    return null;
  }

  try {
    return decrypt(user.githubAccessToken);
  } catch {
    return null;
  }
}

function getGitHubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'renderlite-api',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function requestGitHub<T>(
  path: string,
  token?: string
): Promise<{ status: number; data: T | null }> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers: getGitHubHeaders(token),
  });

  if (!response.ok) {
    return { status: response.status, data: null };
  }

  const data = (await response.json()) as T;
  return { status: response.status, data };
}

function parseGitHubRepoUrl(rawRepoUrl: string): {
  owner: string;
  repo: string;
  normalizedUrl: string;
} {
  let url: URL;
  try {
    url = new URL(rawRepoUrl.trim());
  } catch {
    throw new AppError('Invalid GitHub repository URL', 400);
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new AppError('Repository must be hosted on github.com', 400);
  }

  const parts = url.pathname
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new AppError('Repository URL must look like https://github.com/<owner>/<repo>', 400);
  }

  const [owner, repo] = parts;

  if (!owner || !repo) {
    throw new AppError('Invalid GitHub repository URL', 400);
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}

async function verifyGitHubRepository(
  owner: string,
  repo: string,
  githubToken: string | null
): Promise<GitHubRepository> {
  const lookup = await requestGitHub<GitHubRepository>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    githubToken ?? undefined
  );

  if (lookup.data) {
    return lookup.data;
  }

  if (lookup.status === 404) {
    throw new AppError(
      githubToken
        ? 'Repository not found or not accessible with your GitHub account'
        : 'Repository not found. Sign in with GitHub again for private repositories.',
      400
    );
  }

  if (lookup.status === 401 || lookup.status === 403) {
    throw new AppError(
      'GitHub access token is unavailable or lacks permission. Sign in with GitHub again.',
      400
    );
  }

  throw new AppError('Failed to verify repository with GitHub. Please try again.', 502);
}

async function verifyGitHubBranchExists(
  owner: string,
  repo: string,
  branch: string,
  githubToken: string | null
): Promise<void> {
  const lookup = await requestGitHub<Record<string, unknown>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    githubToken ?? undefined
  );

  if (lookup.data) {
    return;
  }

  if (lookup.status === 404) {
    throw new AppError(`Branch "${branch}" was not found in the selected repository`, 400);
  }

  if (lookup.status === 401 || lookup.status === 403) {
    throw new AppError('Unable to verify branch with GitHub. Please sign in again and retry.', 400);
  }

  throw new AppError('Failed to verify branch with GitHub. Please try again.', 502);
}

serviceRouter.use(authenticate);

// List services
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
      services.map((service: any) => ({
        ...service,
        envVars: maskEnvVars(service.envVars),
      }))
    );
  } catch (error) {
    next(error);
  }
});

// List GitHub repositories for authenticated user (owner repos only)
serviceRouter.get('/github/repos', async (req: AuthRequest, res, next) => {
  try {
    const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.perPage ?? '50'), 10) || 50)
    );

    const githubToken = await getGitHubAccessToken(req.user!.id);
    if (!githubToken) {
      return res.json({
        repositories: [],
        page,
        perPage,
        hasMore: false,
        requiresReconnect: true,
      });
    }

    const response = await requestGitHub<GitHubRepository[]>(
      `/user/repos?affiliation=owner&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      githubToken
    );

    if (response.status === 401 || response.status === 403) {
      return res.json({
        repositories: [],
        page,
        perPage,
        hasMore: false,
        requiresReconnect: true,
      });
    }

    if (!response.data) {
      throw new AppError('Failed to fetch repositories from GitHub', 502);
    }

    const repositories = response.data
      .filter((repo) => {
        if (!q) return true;
        return (
          repo.name.toLowerCase().includes(q) || repo.full_name.toLowerCase().includes(q)
        );
      })
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url.replace(/\/+$/, ''),
        private: repo.private,
        defaultBranch: repo.default_branch || 'main',
        updatedAt: repo.updated_at,
      }));

    res.json({
      repositories,
      page,
      perPage,
      hasMore: response.data.length === perPage,
      requiresReconnect: false,
    });
  } catch (error) {
    next(error);
  }
});

// Get single service (includes webhook URL)
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
        domains: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    const webhookUrl = service.webhookSecret
      ? `${apiUrl}/api/webhooks/github/${service.id}`
      : null;

    res.json({
      ...service,
      envVars: maskEnvVars(service.envVars),
      webhookUrl,
    });
  } catch (error) {
    next(error);
  }
});

// Create service
serviceRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const {
      name,
      projectId,
      repoUrl,
      branch,
      runtime,
      envVars,
      healthCheckPath,
      healthCheckInterval,
      healthCheckTimeout,
    } = req.body;

    if (!name || !projectId || !repoUrl) {
      throw new AppError('Name, projectId, and repoUrl are required', 400);
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user!.id,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const { owner, repo } = parseGitHubRepoUrl(repoUrl);
    const githubToken = await getGitHubAccessToken(req.user!.id);
    const verifiedRepo = await verifyGitHubRepository(owner, repo, githubToken);

    const selectedBranch = typeof branch === 'string' ? branch.trim() : '';
    if (selectedBranch) {
      await verifyGitHubBranchExists(owner, repo, selectedBranch, githubToken);
    }
    const finalBranch = selectedBranch || verifiedRepo.default_branch || 'main';

    const subdomain = await generateSubdomain(name);
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const encryptedEnvVars =
      envVars !== undefined ? normalizeAndEncryptEnvVars(envVars) : null;

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        projectId,
        repoUrl: verifiedRepo.html_url.replace(/\/+$/, ''),
        branch: finalBranch,
        runtime: runtime || null,
        subdomain,
        envVars: encryptedEnvVars as any,
        webhookSecret,
        healthCheckPath: healthCheckPath || null,
        healthCheckInterval: healthCheckInterval ?? 30,
        healthCheckTimeout: healthCheckTimeout ?? 5,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    res.status(201).json({
      ...service,
      envVars: maskEnvVars(service.envVars),
      webhookUrl: `${apiUrl}/api/webhooks/github/${service.id}`,
    });
  } catch (error) {
    next(error);
  }
});

// Update service
serviceRouter.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const {
      name,
      branch,
      runtime,
      envVars,
      healthCheckPath,
      healthCheckInterval,
      healthCheckTimeout,
    } = req.body;

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
        ...(healthCheckPath !== undefined && { healthCheckPath }),
        ...(healthCheckInterval !== undefined && { healthCheckInterval }),
        ...(healthCheckTimeout !== undefined && { healthCheckTimeout }),
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
