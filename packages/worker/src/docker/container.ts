import Docker from 'dockerode';
import { DOCKER_LABELS, DOCKER_NETWORK, DEFAULTS } from '@renderlite/shared';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

interface RunContainerOptions {
  imageName: string;
  subdomain: string;
  envVars?: Record<string, string>;
  port?: number;
}

/**
 * Run a container with Traefik labels for automatic routing
 */
export async function runContainer(options: RunContainerOptions): Promise<string> {
  const { imageName, subdomain, envVars = {}, port = DEFAULTS.CONTAINER_PORT } = options;
  
  const containerName = `renderlite-${subdomain}`;
  const baseDomain = process.env.BASE_DOMAIN || 'renderlite.local';
  const hostRule = `Host(\`${subdomain}.${baseDomain}\`)`;

  // Convert env vars to Docker format
  const envArray = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);

  // Traefik labels for dynamic routing
  const labels: Record<string, string> = {
    [DOCKER_LABELS.TRAEFIK_ENABLE]: 'true',
    [DOCKER_LABELS.TRAEFIK_NETWORK]: DOCKER_NETWORK,
    [DOCKER_LABELS.TRAEFIK_ROUTER_RULE(containerName)]: hostRule,
    [DOCKER_LABELS.TRAEFIK_ROUTER_ENTRYPOINTS(containerName)]: 'web',
    [DOCKER_LABELS.TRAEFIK_SERVICE_PORT(containerName)]: port.toString(),
    'renderlite.managed': 'true',
    'renderlite.subdomain': subdomain,
  };

  // Remove existing container with same name if exists
  try {
    const existingContainer = docker.getContainer(containerName);
    await existingContainer.stop();
    await existingContainer.remove();
  } catch {
    // Container doesn't exist, that's fine
  }

  // Create and start container
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
      // Resource limits
      Memory: 512 * 1024 * 1024, // 512MB
      NanoCpus: 500000000, // 0.5 CPU
    },
  });

  await container.start();

  return container.id;
}

/**
 * Stop a container
 */
export async function stopContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  
  try {
    await container.stop({ t: 10 }); // 10 second timeout
  } catch (error: any) {
    // Container might already be stopped
    if (!error.message?.includes('already stopped')) {
      throw error;
    }
  }
}

/**
 * Remove a container
 */
export async function removeContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  
  await stopContainer(containerId);
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
