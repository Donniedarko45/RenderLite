import simpleGit, { SimpleGit } from 'simple-git';
import { DEFAULTS } from '@renderlite/shared';

/**
 * Build an authenticated clone URL by injecting the token.
 * Input:  https://github.com/owner/repo
 * Output: https://{token}@github.com/owner/repo.git
 */
function buildAuthUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`);
  url.username = token;
  return url.toString();
}

export async function cloneRepository(
  repoUrl: string,
  branch: string,
  targetDir: string,
  githubToken?: string
): Promise<void> {
  const git: SimpleGit = simpleGit();

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULTS.CLONE_TIMEOUT_MS);

  const cloneUrl = githubToken ? buildAuthUrl(repoUrl, githubToken) : repoUrl;

  try {
    await git.clone(cloneUrl, targetDir, [
      '--branch', branch,
      '--depth', '1',
      '--single-branch',
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLatestCommitSha(repoDir: string): Promise<string> {
  const git: SimpleGit = simpleGit(repoDir);
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash || 'unknown';
}

export async function getRepoSize(repoDir: string): Promise<number> {
  const git: SimpleGit = simpleGit(repoDir);
  const result = await git.raw(['count-objects', '-vH']);

  const match = result.match(/size-pack:\s*(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}
