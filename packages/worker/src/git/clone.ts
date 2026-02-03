import simpleGit, { SimpleGit } from 'simple-git';
import { DEFAULTS } from '@renderlite/shared';

export async function cloneRepository(
  repoUrl: string,
  branch: string,
  targetDir: string
): Promise<void> {
  const git: SimpleGit = simpleGit();

  // Set timeout for clone operation
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, DEFAULTS.CLONE_TIMEOUT_MS);

  try {
    // Clone with depth 1 for faster checkout (shallow clone)
    await git.clone(repoUrl, targetDir, [
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
  
  // Parse size from output
  const match = result.match(/size-pack:\s*(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}
