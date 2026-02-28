import { exec } from 'child_process';
import { promisify } from 'util';
import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { DEFAULTS } from '@renderlite/shared';

const execAsync = promisify(exec);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

type LogCallback = (log: string) => void;

async function runNixpacksBuild(command: string, log: LogCallback): Promise<void> {
  const { stdout, stderr } = await execAsync(command, {
    timeout: DEFAULTS.BUILD_TIMEOUT_MS,
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer
  });

  if (stdout) {
    const lines = stdout
      .split('\n')
      .filter((line) => line.includes('==>') || line.includes('Step') || line.includes('Successfully'));
    lines.forEach((line) => log(`   ${line}`));
  }

  if (stderr && !stderr.toLowerCase().includes('warning')) {
    log(`   ⚠️ ${stderr}`);
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

/**
 * Build image using Nixpacks
 */
export async function buildWithNixpacks(
  sourceDir: string,
  imageName: string,
  log: LogCallback
): Promise<void> {
  log('Running Nixpacks build...');

  const localCommand = `nixpacks build "${sourceDir}" --name "${imageName}"`;

  try {
    await runNixpacksBuild(localCommand, log);
  } catch (error: any) {
    if (error.killed) {
      throw new Error('Build timed out');
    }

    if (!isLocalNixpacksMissing(error)) {
      throw new Error(`Nixpacks build failed: ${error.message}`);
    }

    log('   ⚠️ Local nixpacks not found, using Dockerized Nixpacks fallback');
    const dockerizedCommand = [
      'docker run --rm',
      '-v /var/run/docker.sock:/var/run/docker.sock',
      `-v "${sourceDir}:/app"`,
      '-w /app',
      'ghcr.io/railwayapp/nixpacks:latest',
      `build /app --name "${imageName}"`,
    ].join(' ');

    try {
      await runNixpacksBuild(dockerizedCommand, log);
    } catch (fallbackError: any) {
      if (fallbackError.killed) {
        throw new Error('Build timed out');
      }
      throw new Error(`Nixpacks build failed with Dockerized fallback: ${fallbackError.message}`);
    }
  }
}

/**
 * Build image using Dockerfile
 */
export async function buildWithDockerfile(
  sourceDir: string,
  imageName: string,
  log: LogCallback
): Promise<void> {
  log('Running Docker build...');

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
        }
      );

      // Set timeout
      const timeout = setTimeout(() => {
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
        reject(new Error('Build timed out'));
      }, DEFAULTS.BUILD_TIMEOUT_MS);

      docker.modem.followProgress(
        stream,
        (err, output) => {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
        (event) => {
          // Log build progress
          if (event.stream) {
            const line = event.stream.trim();
            if (line && (line.startsWith('Step') || line.includes('-->'))) {
              log(`   ${line}`);
            }
          }
          if (event.error) {
            log(`   ❌ ${event.error}`);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Detect runtime from source directory
 */
export async function detectRuntime(sourceDir: string): Promise<string | null> {
  const files = await fs.readdir(sourceDir);
  
  if (files.includes('package.json')) {
    return 'node';
  }
  if (files.includes('requirements.txt') || files.includes('Pipfile')) {
    return 'python';
  }
  if (files.includes('go.mod')) {
    return 'go';
  }
  if (files.includes('Cargo.toml')) {
    return 'rust';
  }
  if (files.includes('Gemfile')) {
    return 'ruby';
  }
  if (files.includes('pom.xml') || files.includes('build.gradle')) {
    return 'java';
  }
  if (files.includes('composer.json')) {
    return 'php';
  }

  return null;
}
