import Docker from 'dockerode';
import { DOCKER_LABELS, DOCKER_NETWORK, DEFAULTS } from '@renderlite/shared';

export const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function isTlsEnabled(): boolean {
  return process.env.ENABLE_TLS === 'true';
}

export interface RunContainerOptions {
  imageName: string;
  subdomain: string;
  envVars?: Record<string, string>;
  port?: number;
  customDomains?: string[];
  containerNameOverride?: string;
}

/**
 * Run a container with Traefik labels for automatic routing.
 * Supports TLS (when ENABLE_TLS=true) and custom domain routing.
 */
export async function runContainer(options: RunContainerOptions): Promise<string> {
  const {
    imageName,
    subdomain,
    envVars = {},
    port = DEFAULTS.CONTAINER_PORT,
    customDomains = [],
    containerNameOverride,
  } = options;

  const containerName = containerNameOverride || `renderlite-${subdomain}`;
  const baseDomain = process.env.BASE_DOMAIN || 'renderlite.local';
  const hostRule = `Host(\`${subdomain}.${baseDomain}\`)`;
  const tlsEnabled = isTlsEnabled();
  const entrypoint = tlsEnabled ? 'websecure' : 'web';

  const envArray = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);

  const labels: Record<string, string> = {
    [DOCKER_LABELS.TRAEFIK_ENABLE]: 'true',
    [DOCKER_LABELS.TRAEFIK_NETWORK]: DOCKER_NETWORK,
    [DOCKER_LABELS.TRAEFIK_ROUTER_RULE(containerName)]: hostRule,
    [DOCKER_LABELS.TRAEFIK_ROUTER_ENTRYPOINTS(containerName)]: entrypoint,
    [DOCKER_LABELS.TRAEFIK_SERVICE_PORT(containerName)]: port.toString(),
    'renderlite.managed': 'true',
    'renderlite.subdomain': subdomain,
  };

  if (tlsEnabled) {
    labels[DOCKER_LABELS.TRAEFIK_ROUTER_TLS(containerName)] = 'true';
    labels[DOCKER_LABELS.TRAEFIK_ROUTER_CERTRESOLVER(containerName)] = 'letsencrypt';
  }

  for (let i = 0; i < customDomains.length; i++) {
    const domain = customDomains[i];
    const routerName = `${containerName}-domain-${i}`;
    labels[DOCKER_LABELS.TRAEFIK_ROUTER_RULE(routerName)] = `Host(\`${domain}\`)`;
    labels[DOCKER_LABELS.TRAEFIK_ROUTER_ENTRYPOINTS(routerName)] = entrypoint;
    labels[`traefik.http.routers.${routerName}.service`] = containerName;
    if (tlsEnabled) {
      labels[DOCKER_LABELS.TRAEFIK_ROUTER_TLS(routerName)] = 'true';
      labels[DOCKER_LABELS.TRAEFIK_ROUTER_CERTRESOLVER(routerName)] = 'letsencrypt';
    }
  }

  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.stop();
    await existingContainer.remove();
  } catch {
    // Container doesn't exist
  }

  const container = await docker.createContainer({
    Image: imageName,
    name: containerName,
    Env: envArray,
    Labels: labels,
    ExposedPorts: {
      [`${port}/tcp`]: {},
    },
    HostConfig: {
      NetworkMode: DOCKER_NETWORK,
      RestartPolicy: {
        Name: 'unless-stopped',
      },
      Memory: 512 * 1024 * 1024,
      NanoCpus: 500000000,
    },
  });

  await container.start();

  return container.id;
}

/**
 * Get the internal IP address of a container on the renderlite network
 */
export async function getContainerIp(containerId: string): Promise<string | null> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.NetworkSettings.Networks?.[DOCKER_NETWORK]?.IPAddress || null;
  } catch {
    return null;
  }
}

/**
 * Stop a container
 */
export async function stopContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);

  try {
    await container.stop({ t: 10 });
  } catch (error: any) {
    if (!error.message?.includes('already stopped') && error.statusCode !== 304) {
      throw error;
    }
  }
}

/**
 * Remove a container (stops first if running)
 */
export async function removeContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);

  try {
    await stopContainer(containerId);
  } catch {
    // ignore stop errors
  }
  await container.remove({ force: true });
}

/**
 * Get container logs
 */
export async function getContainerLogs(
  containerId: string,
  options: { tail?: number; since?: number } = {}
): Promise<string> {
  const container = docker.getContainer(containerId);

  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: options.tail || 100,
    since: options.since || 0,
  });

  return logs.toString();
}

/**
 * Get container stats
 */
export async function getContainerStats(containerId: string): Promise<Docker.ContainerStats> {
  const container = docker.getContainer(containerId);
  return container.stats({ stream: false });
}

/**
 * Check if container is running
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}

/**
 * List all RenderLite managed containers
 */
export async function listManagedContainers(): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({
    all: true,
    filters: {
      label: ['renderlite.managed=true'],
    },
  });
}

/**
 * Cleanup stopped containers
 */
export async function cleanupStoppedContainers(): Promise<string[]> {
  const containers = await listManagedContainers();
  const removed: string[] = [];

  for (const containerInfo of containers) {
    if (containerInfo.State === 'exited') {
      try {
        const container = docker.getContainer(containerInfo.Id);
        await container.remove();
        removed.push(containerInfo.Id);
      } catch (error) {
        console.error(`Failed to remove container ${containerInfo.Id}:`, error);
      }
    }
  }

  return removed;
}
