import { Worker } from 'bullmq';
import dotenv from 'dotenv';
import {
  DeploymentStatus,
  QUEUES,
  REDIS_CHANNELS,
  ServiceStatus,
  type DeploymentJobData,
  type DeploymentJobResult,
  type RealtimeEvent,
} from '@renderlite/shared';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { processDeployment } from './jobs/deployment.js';
import { runAllCleanupTasks } from './jobs/cleanup.js';

dotenv.config();

// Run cleanup tasks every hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

console.log('🔧 Starting RenderLite Worker...');

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

// Build queue worker
const buildWorker = new Worker<DeploymentJobData, DeploymentJobResult>(
  QUEUES.BUILD,
  async (job) => {
    console.log(`\n📦 Processing deployment job: ${job.id}`);
    console.log(`   Service: ${job.data.serviceId}`);
    console.log(`   Repo: ${job.data.repoUrl}`);
    console.log(`   Branch: ${job.data.branch}`);

    try {
      await publishDeploymentStatus(job.data.deploymentId, DeploymentStatus.BUILDING);
      await publishServiceStatus(job.data.serviceId, ServiceStatus.DEPLOYING);

      const result = await processDeployment(job.data, (log) => {
        // Log progress updates
        void job.log(log);
        void publishRealtimeEvent({
          type: 'deployment:log',
          deploymentId: job.data.deploymentId,
          log,
          timestamp: new Date().toISOString(),
        });
        console.log(`   ${log}`);
      });

      return result;
    } catch (error) {
      console.error(`   ❌ Deployment failed:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2, // Process 2 deployments at a time
    limiter: {
      max: 5,
      duration: 60000, // Max 5 jobs per minute
    },
  }
);

// Event handlers
buildWorker.on('completed', async (job, result) => {
  if (!result.success) {
    console.log(`⚠️ Job ${job.id} completed with failed build result`);
    const failureLog = result.logs || `Deployment failed: ${result.error || 'Unknown error'}`;
    await prisma.deployment.update({
      where: { id: job.data.deploymentId },
      data: {
        status: DeploymentStatus.FAILED,
        logs: failureLog,
        finishedAt: new Date(),
      },
    });

    await prisma.service.update({
      where: { id: job.data.serviceId },
      data: { status: ServiceStatus.FAILED },
    });

    await publishDeploymentStatus(job.data.deploymentId, DeploymentStatus.FAILED);
    await publishServiceStatus(job.data.serviceId, ServiceStatus.FAILED);
    return;
  }

  console.log(`✅ Job ${job.id} completed successfully`);

  if (result.containerId) {
    console.log(`   Container ID: ${result.containerId}`);
  }

  // Update deployment status in database
  await prisma.deployment.update({
    where: { id: job.data.deploymentId },
    data: {
      status: DeploymentStatus.SUCCESS,
      logs: result.logs,
      finishedAt: new Date(),
    },
  });

  // Update service status
  await prisma.service.update({
    where: { id: job.data.serviceId },
    data: {
      status: ServiceStatus.RUNNING,
      containerId: result.containerId,
    },
  });

  await publishDeploymentStatus(
    job.data.deploymentId,
    DeploymentStatus.SUCCESS,
    result.containerId
  );
  await publishServiceStatus(job.data.serviceId, ServiceStatus.RUNNING);
});

buildWorker.on('failed', async (job, error) => {
  console.error(`❌ Job ${job?.id} failed:`, error.message);

  if (job) {
    // Update deployment status
    await prisma.deployment.update({
      where: { id: job.data.deploymentId },
      data: {
        status: DeploymentStatus.FAILED,
        logs: `Deployment failed: ${error.message}`,
        finishedAt: new Date(),
      },
    });

    // Update service status
    await prisma.service.update({
      where: { id: job.data.serviceId },
      data: { status: ServiceStatus.FAILED },
    });

    await publishDeploymentStatus(job.data.deploymentId, DeploymentStatus.FAILED);
    await publishServiceStatus(job.data.serviceId, ServiceStatus.FAILED);
  }
});

buildWorker.on('progress', (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${JSON.stringify(progress)}`);
});

buildWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down worker...');
  clearInterval(cleanupInterval);
  await buildWorker.close();
  await prisma.$disconnect();
  await redis.quit();
  console.log('Worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Schedule cleanup tasks
const cleanupInterval = setInterval(async () => {
  try {
    await runAllCleanupTasks();
  } catch (error) {
    console.error('Cleanup task failed:', error);
  }
}, CLEANUP_INTERVAL_MS);

// Run initial cleanup after startup
setTimeout(() => {
  runAllCleanupTasks().catch(console.error);
}, 10000);

console.log('✅ Worker started, listening for jobs...');
console.log(`🔄 Cleanup tasks scheduled every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);
