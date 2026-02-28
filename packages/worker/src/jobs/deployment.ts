import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { DeploymentJobData, DeploymentJobResult, DEFAULTS } from '@renderlite/shared';
import { cloneRepository, getLatestCommitSha } from '../git/clone.js';
import { buildWithNixpacks, buildWithDockerfile } from '../builders/index.js';
import { runContainer, stopContainer } from '../docker/container.js';
import { prisma } from '../lib/prisma.js';

type LogCallback = (log: string) => void;

export async function processDeployment(
  data: DeploymentJobData,
  log: LogCallback
): Promise<DeploymentJobResult> {
  const workDir = path.join(os.tmpdir(), 'renderlite', data.deploymentId);
  let logs = '';
  
  const appendLog = (message: string) => {
    logs += message + '\n';
    log(message);
  };

  try {
    // Update deployment status to BUILDING
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'BUILDING', startedAt: new Date() },
    });

    appendLog('==> Starting deployment...');
    appendLog(`📂 Work directory: ${workDir}`);

    // Create work directory
    await fs.mkdir(workDir, { recursive: true });

    // Step 1: Clone repository
    appendLog(`\n==> Cloning repository: ${data.repoUrl}`);
    appendLog(`   Branch: ${data.branch}`);
    
    await cloneRepository(data.repoUrl, data.branch, workDir);
    appendLog('    Done: Repository cloned successfully');

    // Get commit SHA
    const commitSha = await getLatestCommitSha(workDir);
    appendLog(`    Info: Commit: ${commitSha.substring(0, 7)}`);
    
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { commitSha },
    });

    // Step 2: Detect build method and build image
    const imageName = `renderlite-${data.subdomain}:${commitSha.substring(0, 7)}`;
    appendLog(`\n==> Building image: ${imageName}`);

    const hasDockerfile = await fileExists(path.join(workDir, 'Dockerfile'));
    
    if (hasDockerfile) {
      appendLog('📄 Dockerfile detected, using Docker build');
      await buildWithDockerfile(workDir, imageName, appendLog);
    } else {
      appendLog('    Info: No Dockerfile found, using Nixpacks');
      await buildWithNixpacks(workDir, imageName, appendLog);
    }

    appendLog('    Done: Image built successfully');

    // Step 3: Stop existing container if any
    const existingService = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { containerId: true },
    });

    if (existingService?.containerId) {
      appendLog(`\n🛑 Stopping existing container: ${existingService.containerId.substring(0, 12)}`);
      try {
        await stopContainer(existingService.containerId);
        appendLog('    Done: Old container stopped');
      } catch (error) {
        appendLog('    Warn: Could not stop old container (may already be stopped)');
      }
    }

    // Step 4: Run new container
    appendLog(`\n==> Starting container...`);
    
    const containerId = await runContainer({
      imageName,
      subdomain: data.subdomain,
      envVars: data.envVars,
    });

    appendLog(`    Done: Container started: ${containerId.substring(0, 12)}`);
    appendLog(`\n🌐 Service available at: http://${data.subdomain}.${process.env.BASE_DOMAIN || 'renderlite.local'}`);

    // Cleanup work directory
    await fs.rm(workDir, { recursive: true, force: true });

    return {
      success: true,
      containerId,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    appendLog(`\n[ERROR] Deployment failed: ${errorMessage}`);

    // Cleanup on error
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: errorMessage,
      logs,
    };
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
