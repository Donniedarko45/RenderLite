import { RollbackJobData, DeploymentJobResult, DEFAULTS } from '@renderlite/shared';
import { runContainer, stopContainer, removeContainer } from '../docker/container.js';
import { waitForHealthCheck } from '../health/checker.js';
import { prisma } from '../lib/prisma.js';

type LogCallback = (log: string) => void;

/**
 * Process a rollback: skip build, just run the container from an existing image tag.
 * Uses blue-green deployment when health checks are configured.
 */
export async function processRollback(
  data: RollbackJobData,
  log: LogCallback
): Promise<DeploymentJobResult> {
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

    appendLog('==> Starting rollback...');
    appendLog(`   Image: ${data.imageTag}`);

    const domains = await prisma.domain.findMany({
      where: { serviceId: data.serviceId, verified: true },
      select: { hostname: true },
    });
    const customDomains = domains.map((d) => d.hostname);

    const existingService = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { containerId: true },
    });

    const useBlueGreen = !!existingService?.containerId && !!data.healthCheckPath;
    let containerId: string;

    if (useBlueGreen) {
      appendLog('\n==> Blue-green rollback...');
      containerId = await runContainer({
        imageName: data.imageTag,
        subdomain: data.subdomain,
        envVars: data.envVars,
        customDomains,
        containerNameOverride: `renderlite-${data.subdomain}-new`,
      });

      appendLog(`   New container: ${containerId.substring(0, 12)}`);
      appendLog(`   Running health check: ${data.healthCheckPath}`);

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
        appendLog('   [ERROR] Health check failed during rollback');
        try { await removeContainer(containerId); } catch { /* ignore */ }
        return { success: false, error: 'Health check failed during rollback', logs };
      }

      appendLog('   Health check passed');

      try {
        await removeContainer(existingService.containerId!);
      } catch {
        appendLog('   [WARN] Could not remove old container');
      }

      try { await removeContainer(containerId); } catch { /* ignore */ }
      containerId = await runContainer({
        imageName: data.imageTag,
        subdomain: data.subdomain,
        envVars: data.envVars,
        customDomains,
      });
    } else {
      if (existingService?.containerId) {
        appendLog(`   Stopping existing container...`);
        try {
          await stopContainer(existingService.containerId);
        } catch {
          appendLog('   [WARN] Could not stop old container');
        }
      }

      containerId = await runContainer({
        imageName: data.imageTag,
        subdomain: data.subdomain,
        envVars: data.envVars,
        customDomains,
      });

      if (data.healthCheckPath) {
        appendLog(`   Running health check: ${data.healthCheckPath}`);
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
          try { await removeContainer(containerId); } catch { /* ignore */ }
          return { success: false, error: 'Health check failed during rollback', logs };
        }
      }
    }

    const protocol = process.env.ENABLE_TLS === 'true' ? 'https' : 'http';
    appendLog(`\n==> Rollback complete`);
    appendLog(`   Service at: ${protocol}://${data.subdomain}.${process.env.BASE_DOMAIN || 'renderlite.local'}`);

    return {
      success: true,
      containerId,
      imageTag: data.imageTag,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    appendLog(`\n[ERROR] Rollback failed: ${errorMessage}`);
    return { success: false, error: errorMessage, logs };
  }
}
