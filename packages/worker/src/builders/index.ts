import { exec } from 'child_process';
import { promisify } from 'util';
import Docker from 'dockerode';
import fs from 'fs/promises';
import { DEFAULTS } from '@renderlite/shared';

const execAsync = promisify(exec);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const BUILD_TIMEOUT_MS = (() => {
  const raw = process.env.BUILD_TIMEOUT_MS;
  if (!raw) {
    return DEFAULTS.BUILD_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 60_000) {
    return DEFAULTS.BUILD_TIMEOUT_MS;
  }
  return parsed;
})();
const BUILD_TIMEOUT_MINUTES = Math.round(BUILD_TIMEOUT_MS / 60_000);

type LogCallback = (log: string) => void;

async function runNixpacksBuild(command: string, log: LogCallback): Promise<void> {
  const { stdout, stderr } = await execAsync(command, {
    timeout: BUILD_TIMEOUT_MS,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
  });

  if (stdout) {
    const lines = stdout
      .split('\n')
      .filter((line) => line.includes('==>') || line.includes('Step') || line.includes('Successfully'));
    lines.forEach((line) => log(`   ${line}`));
  }

  if (stderr && !stderr.toLowerCase().includes('warning')) {
    log(`   [WARN] ${stderr}`);
  }
}

function isLocalNixpacksMissing(error: any): boolean {
  const details = `${error?.message || ''}\n${error?.stderr || ''}\n${error?.stdout || ''}`.toLowerCase();
  return (
    details.includes('nixpacks: not found') ||
    details.includes('command not found: nixpacks') ||
    details.includes('spawn nixpacks enoent')
  );
}

async function runDockerizedNixpacksBuild(
  sourceDir: string,
  cacheDir: string,
  imageName: string,
  log: LogCallback
): Promise<void> {
  const baseCommandParts = [
    'docker run --rm',
    '-v /var/run/docker.sock:/var/run/docker.sock',
    `-v "${sourceDir}:/app"`,
    `-v "${cacheDir}:/cache"`,
    '-w /app',
  ];
  const nixpacksArgs = `build /app --name "${imageName}" --cache-key "${imageName.split(':')[0]}"`;
  const imageNameRef = 'ghcr.io/railwayapp/nixpacks:latest';
  const entrypointCandidates = ['nixpacks', '/nixpacks', '/usr/local/bin/nixpacks'];

  let lastError: any;

  for (const entrypoint of entrypointCandidates) {
    const command = [
      ...baseCommandParts,
      `--entrypoint ${entrypoint}`,
      imageNameRef,
      nixpacksArgs,
    ].join(' ');

    try {
      log(`   Trying Dockerized Nixpacks with entrypoint: ${entrypoint}`);
      await runNixpacksBuild(command, log);
      return;
    } catch (error: any) {
      lastError = error;
    }
  }

  // Some image variants expose nixpacks as command but no ENTRYPOINT.
  const commandCandidates = [
    `nixpacks ${nixpacksArgs}`,
    `/usr/local/bin/nixpacks ${nixpacksArgs}`,
    `/nixpacks ${nixpacksArgs}`,
  ];

  for (const commandCandidate of commandCandidates) {
    const command = [...baseCommandParts, imageNameRef, commandCandidate].join(' ');
    try {
      log(`   Trying Dockerized Nixpacks command: ${commandCandidate.split(' ')[0]}`);
      await runNixpacksBuild(command, log);
      return;
    } catch (error: any) {
      lastError = error;
    }
  }

  if (lastError?.killed) {
    throw new Error(`Build timed out after ${BUILD_TIMEOUT_MINUTES} minutes`);
  }

  throw new Error(
    `Nixpacks build failed with Dockerized fallback: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Build image using Nixpacks with persistent cache volume
 */
export async function buildWithNixpacks(
  sourceDir: string,
  imageName: string,
  log: LogCallback
): Promise<void> {
  log('Running Nixpacks build...');

  const cacheDir = '/tmp/nixpacks-cache';
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch {
    // ignore
  }

  const localCommand = `nixpacks build "${sourceDir}" --name "${imageName}" --cache-key "${imageName.split(':')[0]}"`;

  try {
    await runNixpacksBuild(localCommand, log);
  } catch (error: any) {
    if (error.killed) {
      throw new Error(`Build timed out after ${BUILD_TIMEOUT_MINUTES} minutes`);
    }

    if (!isLocalNixpacksMissing(error)) {
      throw new Error(`Nixpacks build failed: ${error.message}`);
    }

    log('   [WARN] Local nixpacks not found, using Dockerized Nixpacks fallback');
    await runDockerizedNixpacksBuild(sourceDir, cacheDir, imageName, log);
  }
}

/**
 * Build image using Dockerfile with BuildKit caching.
 * Uses --cache-from with the :latest tag so layer cache is reused across deploys.
 */
export async function buildWithDockerfile(
  sourceDir: string,
  imageName: string,
  log: LogCallback
): Promise<void> {
  log('Running Docker build with BuildKit caching...');

  const baseImage = imageName.split(':')[0];
  const cacheFromTag = `${baseImage}:latest`;

  return new Promise(async (resolve, reject) => {
    try {
      const stream = await docker.buildImage(
        {
          context: sourceDir,
          src: ['.'],
        },
        {
          t: imageName,
          dockerfile: 'Dockerfile',
          buildargs: { BUILDKIT_INLINE_CACHE: '1' },
          cachefrom: JSON.stringify([cacheFromTag]),
        }
      );

      const timeout = setTimeout(() => {
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
        reject(new Error(`Build timed out after ${BUILD_TIMEOUT_MINUTES} minutes`));
      }, BUILD_TIMEOUT_MS);

      docker.modem.followProgress(
        stream,
        (err) => {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            tagLatest(imageName, cacheFromTag, log)
              .then(() => resolve())
              .catch(() => resolve());
          }
        },
        (event) => {
          if (event.stream) {
            const line = event.stream.trim();
            if (line && (line.startsWith('Step') || line.includes('-->'))) {
              log(`   ${line}`);
            }
          }
          if (event.error) {
            log(`   [ERROR] ${event.error}`);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * After a successful build, tag the image as :latest for future cache-from usage
 */
async function tagLatest(imageName: string, latestTag: string, log: LogCallback): Promise<void> {
  try {
    const image = docker.getImage(imageName);
    const [repo, _tag] = latestTag.split(':');
    await image.tag({ repo, tag: 'latest' });
    log(`   Tagged ${imageName} as ${latestTag} for build cache`);
  } catch (error) {
    log(`   [WARN] Failed to tag latest for cache: ${error}`);
  }
}

/**
 * Detect runtime from source directory
 */
export async function detectRuntime(sourceDir: string): Promise<string | null> {
  const files = await fs.readdir(sourceDir);

  if (files.includes('package.json')) return 'node';
  if (files.includes('requirements.txt') || files.includes('Pipfile')) return 'python';
  if (files.includes('go.mod')) return 'go';
  if (files.includes('Cargo.toml')) return 'rust';
  if (files.includes('Gemfile')) return 'ruby';
  if (files.includes('pom.xml') || files.includes('build.gradle')) return 'java';
  if (files.includes('composer.json')) return 'php';

  return null;
}
