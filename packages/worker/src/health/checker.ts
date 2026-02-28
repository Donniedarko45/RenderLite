import http from 'http';
import { DEFAULTS } from '@renderlite/shared';
import { getContainerIp } from '../docker/container.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check request timed out'));
    });
  });
}

/**
 * Poll a container's health check endpoint until it returns 2xx,
 * using exponential backoff between attempts.
 */
export async function waitForHealthCheck(
  containerId: string,
  path: string,
  port: number,
  options?: {
    timeout?: number;
    retries?: number;
    startDelay?: number;
  }
): Promise<boolean> {
  const timeout = (options?.timeout ?? DEFAULTS.HEALTH_CHECK_TIMEOUT) * 1000;
  const retries = options?.retries ?? DEFAULTS.HEALTH_CHECK_RETRIES;
  const startDelay = options?.startDelay ?? DEFAULTS.HEALTH_CHECK_START_DELAY_MS;

  await sleep(startDelay);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const ip = await getContainerIp(containerId);
    if (!ip) {
      if (attempt === retries) return false;
      await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10000));
      continue;
    }

    const url = `http://${ip}:${port}${path}`;

    try {
      const statusCode = await httpGet(url, timeout);
      if (statusCode >= 200 && statusCode < 400) {
        return true;
      }
    } catch {
      // request failed, will retry
    }

    if (attempt < retries) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await sleep(backoff);
    }
  }

  return false;
}
