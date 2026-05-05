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

/** Release tag from https://github.com/railwayapp/nixpacks/releases — must match Dockerfile ARG when bumping. */
const NIXPACKS_RELEASE = process.env.NIXPACKS_RELEASE ?? 'v1.38.0';

/** Nix / OS base image (has curl); NOT the deprecated assumption that this image includes the nixpacks binary. */
const NIXPACKS_DOCKER_BASE_IMAGE =
  process.env.NIXPACKS_DOCKER_BASE_IMAGE ?? 'ghcr.io/railwayapp/nixpacks:ubuntu';

type LogCallback = (log: string) => void;

/** Single-quote a string for safe embedding in bash (POSIX: end quote, \\', resume quote). */
function bashSingleQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

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
  const cacheKey = imageName.split(':')[0];
  /**
   * ghcr.io/railwayapp/nixpacks:latest / :ubuntu are Nix *base* images (Ubuntu + Nix). They do not ship the
   * `nixpacks` CLI at /nixpacks. Download the official release binary inside the container, then run build.
   */
  const innerScript = [
    'set -euo pipefail',
    `NIXVER=${bashSingleQuote(NIXPACKS_RELEASE)}`,
    'ARCH=$(uname -m)',
    'case "$ARCH" in',
    '  x86_64) NIXARCH=x86_64-unknown-linux-gnu ;;',
    '  aarch64|arm64) NIXARCH=aarch64-unknown-linux-gnu ;;',
    '  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;',
    'esac',
    'URL="https://github.com/railwayapp/nixpacks/releases/download/${NIXVER}/nixpacks-${NIXVER}-${NIXARCH}.tar.gz"',
    'curl -fsSL "$URL" | tar xz -C /usr/local/bin nixpacks',
    'chmod +x /usr/local/bin/nixpacks',
    `exec nixpacks build /app --name ${bashSingleQuote(imageName)} --cache-key ${bashSingleQuote(cacheKey)}`,
  ].join('\n');

  const b64 = Buffer.from(innerScript, 'utf8').toString('base64');
  const command = [
    'docker run --rm',
    '-v /var/run/docker.sock:/var/run/docker.sock',
    `-v "${sourceDir}:/app"`,
    `-v "${cacheDir}:/cache"`,
    '-w /app',
    NIXPACKS_DOCKER_BASE_IMAGE,
    `bash -lc "echo ${b64} | base64 -d | bash"`,
  ].join(' ');

  log(
    `   Dockerized Nixpacks: using base image ${NIXPACKS_DOCKER_BASE_IMAGE}, release ${NIXPACKS_RELEASE} (download CLI in-container)`
  );
  await runNixpacksBuild(command, log);
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
