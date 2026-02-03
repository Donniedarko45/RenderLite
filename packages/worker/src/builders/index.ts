import { exec } from 'child_process';
import { promisify } from 'util';
import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { DEFAULTS } from '@renderlite/shared';

const execAsync = promisify(exec);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

type LogCallback = (log: string) => void;

/**
 * Build image using Nixpacks
 */
export async function buildWithNixpacks(
  sourceDir: string,
  imageName: string,
  log: LogCallback
): Promise<void> {
  log('Running Nixpacks build...');

  const command = `nixpacks build ${sourceDir} --name ${imageName}`;
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: DEFAULTS.BUILD_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    if (stdout) {
      // Log relevant output lines
      const lines = stdout.split('\n').filter(line => 
        line.includes('==>') || 
        line.includes('Step') ||
        line.includes('Successfully')
      );
      lines.forEach(line => log(`   ${line}`));
    }

    if (stderr && !stderr.includes('warning')) {
      log(`   ⚠️ ${stderr}`);
    }
  } catch (error: any) {
    if (error.killed) {
      throw new Error('Build timed out');
    }
    throw new Error(`Nixpacks build failed: ${error.message}`);
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
        stream.destroy();
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
