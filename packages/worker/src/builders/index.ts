import { spawn } from 'child_process';
import readline from 'readline';
import Docker from 'dockerode';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULTS } from '@renderlite/shared';

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

function runNixpacksBuild(command: string, log: LogCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', command], {
      env: { ...process.env, DOCKER_BUILDKIT: '1' },
    });

    let timeoutTimer: NodeJS.Timeout | null = null;
    if (BUILD_TIMEOUT_MS > 0) {
      timeoutTimer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Build timed out after ${BUILD_TIMEOUT_MINUTES} minutes`));
      }, BUILD_TIMEOUT_MS);
    }

    const errorChunks: string[] = [];

    const rlOut = readline.createInterface({ input: proc.stdout });
    rlOut.on('line', (line) => {
      const trimmed = line.trimEnd();
      if (trimmed) {
        log(`   ${trimmed}`);
      }
    });

    const rlErr = readline.createInterface({ input: proc.stderr });
    rlErr.on('line', (line) => {
      const trimmed = line.trimEnd();
      if (trimmed) {
        errorChunks.push(trimmed);
        if (trimmed.toLowerCase().includes('error') || trimmed.toLowerCase().includes('failed')) {
          log(`   [ERROR] ${trimmed}`);
        } else {
          log(`   ${trimmed}`);
        }
      }
    });

    proc.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      reject(err);
    });

    proc.on('close', (code) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (code === 0) {
        resolve();
      } else {
        const errDetails = errorChunks.slice(-5).join('\n') || `code ${code}`;
        const err = new Error(`Nixpacks build failed with code ${code}: ${errDetails}`);
        (err as any).stderr = errorChunks.join('\n');
        reject(err);
      }
    });
  });
}

function isLocalNixpacksMissing(error: any): boolean {
  const details = `${error?.message || ''}\n${error?.stderr || ''}\n${error?.stdout || ''}`.toLowerCase();
  return (
    details.includes('nixpacks: not found') ||
    details.includes('command not found: nixpacks') ||
    details.includes('spawn nixpacks enoent')
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prepare environment variables for Nixpacks build.
 * Ensures custom env vars are passed and automatically defaults Node.js version
 * to 20 for Node/Next.js projects that don't specify engines.node or .nvmrc.
 */
async function resolveBuildEnvironment(
  sourceDir: string,
  envVars?: Record<string, string>,
  log?: LogCallback
): Promise<Record<string, string>> {
  const effectiveEnvs: Record<string, string> = { ...(envVars || {}) };

  // If user explicitly configured NIXPACKS_NODE_VERSION or NODE_VERSION, respect it
  if (effectiveEnvs.NIXPACKS_NODE_VERSION || effectiveEnvs.NODE_VERSION) {
    return effectiveEnvs;
  }

  // Check if .nvmrc or .node-version exists in repository
  const hasNvmrc = await fileExists(path.join(sourceDir, '.nvmrc'));
  const hasNodeVersion = await fileExists(path.join(sourceDir, '.node-version'));
  if (hasNvmrc || hasNodeVersion) {
    return effectiveEnvs;
  }

  // Check package.json in repository root
  const pkgPath = path.join(sourceDir, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const raw = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);

      // If engines.node is explicitly defined, let Nixpacks resolve it
      if (pkg.engines?.node) {
        return effectiveEnvs;
      }

      // Default to Node 20 for Node/Next.js projects (Next.js >= 14 requires >= 20.9.0)
      effectiveEnvs.NIXPACKS_NODE_VERSION = '20';
      const isNext = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
      if (log) {
        if (isNext) {
          log('   Info: Detected Next.js project; defaulting NIXPACKS_NODE_VERSION to 20');
        } else {
          log('   Info: Node.js project detected without engines.node; defaulting NIXPACKS_NODE_VERSION to 20');
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  return effectiveEnvs;
}

function formatNixpacksEnvArgs(envs: Record<string, string>): string {
  const args: string[] = [];
  for (const [key, value] of Object.entries(envs)) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      args.push(`--env ${bashSingleQuote(`${key}=${value}`)}`);
    }
  }
  return args.length > 0 ? ` ${args.join(' ')}` : '';
}

async function runDockerizedNixpacksBuild(
  sourceDir: string,
  cacheDir: string,
  imageName: string,
  log: LogCallback,
  buildEnvs: Record<string, string> = {}
): Promise<void> {
  const cacheKey = imageName.split(':')[0];
  const envFlags = formatNixpacksEnvArgs(buildEnvs);

  /**
   * ghcr.io/railwayapp/nixpacks:latest / :ubuntu are Nix *base* images (Ubuntu + Nix). They do not ship the
   * `nixpacks` CLI at /nixpacks. Download the official release binary inside the container, then run build.
   */
  const innerScript = [
    'set -euo pipefail',
    'export PATH="/usr/local/bin:/usr/bin:/cache/bin:$PATH"',
    `NIXVER=${bashSingleQuote(NIXPACKS_RELEASE)}`,
    'ARCH=$(uname -m)',
    'case "$ARCH" in',
    '  x86_64) NIXARCH=x86_64-unknown-linux-gnu ;;',
    '  aarch64|arm64) NIXARCH=aarch64-unknown-linux-gnu ;;',
    '  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;',
    'esac',
    'mkdir -p /cache/bin /usr/local/bin /usr/bin',
    'if [ ! -x /cache/bin/nixpacks ]; then',
    '  URL="https://github.com/railwayapp/nixpacks/releases/download/${NIXVER}/nixpacks-${NIXVER}-${NIXARCH}.tar.gz"',
    '  curl -fsSL "$URL" | tar xz -C /cache/bin nixpacks',
    '  chmod +x /cache/bin/nixpacks',
    'fi',
    'cp -f /cache/bin/nixpacks /usr/bin/nixpacks 2>/dev/null || true',
    'cp -f /cache/bin/nixpacks /usr/local/bin/nixpacks 2>/dev/null || true',
    `exec /cache/bin/nixpacks build /app --name ${bashSingleQuote(imageName)} --cache-key ${bashSingleQuote(cacheKey)}${envFlags}`,
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
  log: LogCallback,
  envVars?: Record<string, string>
): Promise<void> {
  log('Running Nixpacks build...');

  const cacheDir = '/tmp/nixpacks-cache';
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch {
    // ignore
  }

  const effectiveEnvs = await resolveBuildEnvironment(sourceDir, envVars, log);
  const envFlags = formatNixpacksEnvArgs(effectiveEnvs);
  const localCommand = `nixpacks build "${sourceDir}" --name "${imageName}" --cache-key "${imageName.split(':')[0]}"${envFlags}`;

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
    await runDockerizedNixpacksBuild(sourceDir, cacheDir, imageName, log, effectiveEnvs);
  }
}

/**
 * Build image using Dockerfile with BuildKit caching.
 * Uses --cache-from with the :latest tag so layer cache is reused across deploys.
 */
export async function buildWithDockerfile(
  sourceDir: string,
  imageName: string,
  log: LogCallback,
  envVars?: Record<string, string>
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
          buildargs: { BUILDKIT_INLINE_CACHE: '1', ...(envVars || {}) },
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
