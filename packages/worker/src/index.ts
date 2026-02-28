import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import {
  DeploymentStatus,
  QUEUES,
  REDIS_CHANNELS,
  ServiceStatus,
  type DeploymentJobData,
  type DeploymentJobResult,
  type RollbackJobData,
  type RealtimeEvent,
} from '@renderlite/shared';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { processDeployment } from './jobs/deployment.js';
import { processRollback } from './jobs/rollback.js';
import { runAllCleanupTasks } from './jobs/cleanup.js';

dotenv.config();

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

console.log('Starting RenderLite Worker...');

async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(REDIS_CHANNELS.REALTIME_EVENTS, JSON.stringify(event));
  } catch (error) {
    console.error('Failed to publish realtime event:', error);
  }
}

async function publishDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  containerId?: string
): Promise<void> {
  await publishRealtimeEvent({
    type: 'deployment:status',
    deploymentId,
    status,
    containerId,
    timestamp: new Date().toISOString(),
  });
}

async function publishServiceStatus(serviceId: string, status: ServiceStatus): Promise<void> {
  await publishRealtimeEvent({
    type: 'service:status',
    serviceId,
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Shared handler for job completion (used by both build and rollback workers)
 */
async function handleJobCompleted(
  jobData: { deploymentId: string; serviceId: string },
  result: DeploymentJobResult
): Promise<void> {
  if (!result.success) {
    const failureLog = result.logs || `Deployment failed: ${result.error || 'Unknown error'}`;
    await prisma.deployment.update({
      where: { id: jobData.deploymentId },
      data: {
        status: DeploymentStatus.FAILED,
        logs: failureLog,
        finishedAt: new Date(),
      },
    });
    await prisma.service.update({
      where: { id: jobData.serviceId },
      data: { status: ServiceStatus.FAILED },
    });
    await publishDeploymentStatus(jobData.deploymentId, DeploymentStatus.FAILED);
    await publishServiceStatus(jobData.serviceId, ServiceStatus.FAILED);
    return;
  }

  await prisma.deployment.update({
    where: { id: jobData.deploymentId },
    data: {
      status: DeploymentStatus.SUCCESS,
      logs: result.logs,
      imageTag: result.imageTag ?? undefined,
      finishedAt: new Date(),
    },
  });

  await prisma.service.update({
    where: { id: jobData.serviceId },
    data: {
      status: ServiceStatus.RUNNING,
      containerId: result.containerId,
    },
  });

  await publishDeploymentStatus(jobData.deploymentId, DeploymentStatus.SUCCESS, result.containerId);
  await publishServiceStatus(jobData.serviceId, ServiceStatus.RUNNING);
}

async function handleJobFailed(
  jobData: { deploymentId: string; serviceId: string } | undefined,
  error: Error
): Promise<void> {
  if (!jobData) return;

  await prisma.deployment.update({
    where: { id: jobData.deploymentId },
    data: {
      status: DeploymentStatus.FAILED,
      logs: `Deployment failed: ${error.message}`,
      finishedAt: new Date(),
    },
  });
  await prisma.service.update({
    where: { id: jobData.serviceId },
    data: { status: ServiceStatus.FAILED },
  });
  await publishDeploymentStatus(jobData.deploymentId, DeploymentStatus.FAILED);
  await publishServiceStatus(jobData.serviceId, ServiceStatus.FAILED);
}

function createLogCallback(
  jobLog: (msg: string) => void,
  deploymentId: string
) {
  return (log: string) => {
    void jobLog(log);
    void publishRealtimeEvent({
      type: 'deployment:log',
      deploymentId,
      log,
      timestamp: new Date().toISOString(),
    });
    console.log(`   ${log}`);
  };
}

// ---- Build queue worker ----
const buildWorker = new Worker<DeploymentJobData, DeploymentJobResult>(
  QUEUES.BUILD,
  async (job) => {
    console.log(`\nProcessing deployment: ${job.id}`);

    await publishDeploymentStatus(job.data.deploymentId, DeploymentStatus.BUILDING);
    await publishServiceStatus(job.data.serviceId, ServiceStatus.DEPLOYING);

    return processDeployment(
      job.data,
      createLogCallback((msg) => void job.log(msg), job.data.deploymentId)
    );
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: { max: 5, duration: 60000 },
  }
);

buildWorker.on('completed', async (job, result) => {
  console.log(`Build job ${job.id} completed (success=${result.success})`);
  await handleJobCompleted(job.data, result);
});

buildWorker.on('failed', async (job, error) => {
  console.error(`Build job ${job?.id} failed:`, error.message);
  await handleJobFailed(job?.data, error);
});

buildWorker.on('error', (err) => console.error('Build worker error:', err));

// ---- Rollback queue worker ----
const rollbackWorker = new Worker<RollbackJobData, DeploymentJobResult>(
  QUEUES.ROLLBACK,
  async (job) => {
    console.log(`\nProcessing rollback: ${job.id}`);

    await publishDeploymentStatus(job.data.deploymentId, DeploymentStatus.BUILDING);
    await publishServiceStatus(job.data.serviceId, ServiceStatus.DEPLOYING);

    return processRollback(
      job.data,
      createLogCallback((msg) => void job.log(msg), job.data.deploymentId)
    );
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

rollbackWorker.on('completed', async (job, result) => {
  console.log(`Rollback job ${job.id} completed (success=${result.success})`);
  await handleJobCompleted(job.data, result);
});

rollbackWorker.on('failed', async (job, error) => {
  console.error(`Rollback job ${job?.id} failed:`, error.message);
  await handleJobFailed(job?.data, error);
});

rollbackWorker.on('error', (err) => console.error('Rollback worker error:', err));

// ---- Graceful shutdown ----
const shutdown = async () => {
  console.log('\nShutting down worker...');
  clearInterval(cleanupInterval);
  await buildWorker.close();
  await rollbackWorker.close();
  await prisma.$disconnect();
  await redis.quit();
  console.log('Worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---- Cleanup scheduler ----
const cleanupInterval = setInterval(async () => {
  try {
    await runAllCleanupTasks();
  } catch (error) {
    console.error('Cleanup task failed:', error);
  }
}, CLEANUP_INTERVAL_MS);

setTimeout(() => {
  runAllCleanupTasks().catch(console.error);
}, 10000);

console.log('Worker started, listening for build and rollback jobs...');
