// Queue names
export const QUEUES = {
  BUILD: 'build-queue',
  CLEANUP: 'cleanup-queue',
  ROLLBACK: 'rollback-queue',
} as const;

// Redis keys
export const REDIS_KEYS = {
  DEPLOYMENT_LOGS: (deploymentId: string) => `deployment:${deploymentId}:logs`,
  SERVICE_METRICS: (serviceId: string) => `service:${serviceId}:metrics`,
} as const;

// Redis pub/sub channels
export const REDIS_CHANNELS = {
  REALTIME_EVENTS: 'renderlite:realtime:events',
} as const;

// Docker labels for Traefik
export const DOCKER_LABELS = {
  TRAEFIK_ENABLE: 'traefik.enable',
  TRAEFIK_NETWORK: 'traefik.docker.network',
  TRAEFIK_ROUTER_RULE: (name: string) => `traefik.http.routers.${name}.rule`,
  TRAEFIK_ROUTER_ENTRYPOINTS: (name: string) => `traefik.http.routers.${name}.entrypoints`,
  TRAEFIK_ROUTER_TLS: (name: string) => `traefik.http.routers.${name}.tls`,
  TRAEFIK_ROUTER_CERTRESOLVER: (name: string) => `traefik.http.routers.${name}.tls.certresolver`,
  TRAEFIK_SERVICE_PORT: (name: string) => `traefik.http.services.${name}.loadbalancer.server.port`,
} as const;

// Default values
export const DEFAULTS = {
  BRANCH: 'main',
  CONTAINER_PORT: 3000,
  BUILD_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  CLONE_TIMEOUT_MS: 60 * 1000, // 1 minute
  MAX_REPO_SIZE_MB: 500,
  HEALTH_CHECK_INTERVAL: 30,
  HEALTH_CHECK_TIMEOUT: 5,
  HEALTH_CHECK_RETRIES: 10,
  HEALTH_CHECK_START_DELAY_MS: 5000,
} as const;

// Database images for managed databases
export const DATABASE_IMAGES: Record<string, { image: string; port: number; healthCmd: string[] }> = {
  POSTGRES: {
    image: 'postgres:15-alpine',
    port: 5432,
    healthCmd: ['CMD-SHELL', 'pg_isready -U $POSTGRES_USER'],
  },
  REDIS: {
    image: 'redis:7-alpine',
    port: 6379,
    healthCmd: ['CMD', 'redis-cli', 'ping'],
  },
  MYSQL: {
    image: 'mysql:8-alpine',
    port: 3306,
    healthCmd: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
  },
};

// Supported runtimes
export const SUPPORTED_RUNTIMES = [
  'node',
  'python',
  'go',
  'rust',
  'ruby',
  'java',
  'php',
] as const;

export type SupportedRuntime = typeof SUPPORTED_RUNTIMES[number];

// Network name
export const DOCKER_NETWORK = 'renderlite-network';
