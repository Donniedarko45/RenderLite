import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { DeploymentJobData, DeploymentJobResult, DEFAULTS } from '@renderlite/shared';
import { cloneRepository, getLatestCommitSha } from '../git/clone.js';
import { buildWithNixpacks, buildWithDockerfile } from '../builders/index.js';
import { runContainer, stopContainer, removeContainer } from '../docker/container.js';
import { waitForHealthCheck } from '../health/checker.js';
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
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'BUILDING', startedAt: new Date() },
    });

    appendLog('==> Starting deployment...');

    await fs.mkdir(workDir, { recursive: true });

    // Step 1: Clone repository (with optional auth token for private repos)
    appendLog(`\n==> Cloning repository: ${data.repoUrl}`);
    appendLog(`   Branch: ${data.branch}`);
    if (data.githubToken) {
      appendLog('   Using authenticated clone (private repo)');
    }

    await cloneRepository(data.repoUrl, data.branch, workDir, data.githubToken);
    appendLog('    Done: Repository cloned successfully');

    const commitSha = await getLatestCommitSha(workDir);
    appendLog(`    Info: Commit: ${commitSha.substring(0, 7)}`);

    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { commitSha },
    });

    // Step 2: Build image
    const imageTag = `renderlite-${data.subdomain}:${commitSha.substring(0, 7)}`;
    appendLog(`\n==> Building image: ${imageTag}`);

    const hasDockerfile = await fileExists(path.join(workDir, 'Dockerfile'));

    if (hasDockerfile) {
      appendLog('   Dockerfile detected, using Docker build');
      await buildWithDockerfile(workDir, imageTag, appendLog);
    } else {
      appendLog('   No Dockerfile found, using Nixpacks');
      await buildWithNixpacks(workDir, imageTag, appendLog);
    }

    appendLog('    Done: Image built successfully');

    // Save imageTag for rollbacks
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { imageTag },
    });

    // Step 3: Fetch verified custom domains for Traefik routing
    const domains = await prisma.domain.findMany({
      where: { serviceId: data.serviceId, verified: true },
      select: { hostname: true },
    });
    const customDomains = domains.map((d) => d.hostname);

    // Step 4: Blue-green deploy -- start new container first
    const existingService = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { containerId: true },
    });

    appendLog(`\n==> Starting new container...`);

    const useBlueGreen = !!existingService?.containerId && !!data.healthCheckPath;

    let containerId: string;

    if (useBlueGreen) {
      // Blue-green: start new container alongside old one
      containerId = await runContainer({
        imageName: imageTag,
        subdomain: data.subdomain,
        envVars: data.envVars,
        customDomains,
        containerNameOverride: `renderlite-${data.subdomain}-new`,
      });

      appendLog(`    New container started: ${containerId.substring(0, 12)}`);
      appendLog(`\n==> Running health check: ${data.healthCheckPath}`);

      const healthy = await waitForHealthCheck(
        containerId,
        data.healthCheckPath,
        DEFAULTS.CONTAINER_PORT,
        {
          timeout: data.healthCheckTimeout,
          retries: DEFAULTS.HEALTH_CHECK_RETRIES,
        }
      );

      if (!healthy) {
        appendLog('    [ERROR] Health check failed -- rolling back');
        try { await removeContainer(containerId); } catch { /* ignore */ }
        return {
          success: false,
          error: 'Health check failed after deployment',
          logs,
        };
      }

      appendLog('    Done: Health check passed');

      // Stop old container
      appendLog(`\n==> Swapping containers (zero-downtime)...`);
      try {
        await removeContainer(existingService.containerId!);
        appendLog('    Old container removed');
      } catch {
        appendLog('    [WARN] Could not remove old container');
      }

      // Rename new container to the canonical name via re-creation
      // Traefik picks up labels dynamically, so just re-run with the real name
      try { await removeContainer(containerId); } catch { /* ignore */ }
      containerId = await runContainer({
        imageName: imageTag,
        subdomain: data.subdomain,
        envVars: data.envVars,
        customDomains,
      });
      appendLog('    Done: Swap complete');
    } else {
      // Traditional deploy: stop old, start new
      if (existingService?.containerId) {
        appendLog(`   Stopping existing container: ${existingService.containerId.substring(0, 12)}`);
        try {
          await stopContainer(existingService.containerId);
          appendLog('    Done: Old container stopped');
        } catch {
          appendLog('    [WARN] Could not stop old container');
        }
      }

      containerId = await runContainer({
        imageName: imageTag,
        subdomain: data.subdomain,
        envVars: data.envVars,
        customDomains,
      });

      appendLog(`    Done: Container started: ${containerId.substring(0, 12)}`);

      // Run health check if configured (non-blue-green path)
      if (data.healthCheckPath) {
        appendLog(`\n==> Running health check: ${data.healthCheckPath}`);
        const healthy = await waitForHealthCheck(
          containerId,
          data.healthCheckPath,
          DEFAULTS.CONTAINER_PORT,
          {
            timeout: data.healthCheckTimeout,
            retries: DEFAULTS.HEALTH_CHECK_RETRIES,
          }
        );

        if (!healthy) {
          appendLog('    [ERROR] Health check failed');
          try { await removeContainer(containerId); } catch { /* ignore */ }
          return {
            success: false,
            error: 'Health check failed after deployment',
            logs,
          };
        }
        appendLog('    Done: Health check passed');
      }
    }

    const protocol = process.env.ENABLE_TLS === 'true' ? 'https' : 'http';
    appendLog(`\n==> Service available at: ${protocol}://${data.subdomain}.${process.env.BASE_DOMAIN || 'renderlite.local'}`);

    await fs.rm(workDir, { recursive: true, force: true });

    return {
      success: true,
      containerId,
      imageTag,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    appendLog(`\n[ERROR] Deployment failed: ${errorMessage}`);

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
