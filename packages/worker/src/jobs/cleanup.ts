import { prisma } from '../lib/prisma.js';
import { cleanupStoppedContainers, removeContainer, isContainerRunning } from '../docker/container.js';

/**
 * Cleanup orphaned containers that are no longer associated with services
 */
export async function cleanupOrphanedContainers(): Promise<string[]> {
  console.log('🧹 Starting orphaned container cleanup...');
  
  const removed: string[] = [];
  
  try {
    // Get all services with container IDs
    const servicesWithContainers = await prisma.service.findMany({
      where: {
        containerId: { not: null },
      },
      select: {
        id: true,
        containerId: true,
        status: true,
      },
    });

    // Check each container
    for (const service of servicesWithContainers) {
      if (!service.containerId) continue;

      const isRunning = await isContainerRunning(service.containerId);
      
      if (!isRunning && service.status === 'RUNNING') {
        // Container is not running but service thinks it is
        console.log(`  Container ${service.containerId.substring(0, 12)} is not running, updating service status`);
        await prisma.service.update({
          where: { id: service.id },
          data: { status: 'STOPPED', containerId: null },
        });
      }
    }

    // Clean up stopped managed containers
    const stoppedContainers = await cleanupStoppedContainers();
    removed.push(...stoppedContainers);

    if (stoppedContainers.length > 0) {
      console.log(`  Removed ${stoppedContainers.length} stopped containers`);
    }

    console.log('✅ Container cleanup complete');
    return removed;
  } catch (error) {
    console.error('❌ Container cleanup failed:', error);
    throw error;
  }
}

/**
 * Cleanup old deployments (keep only last N per service)
 */
export async function cleanupOldDeployments(keepCount: number = 10): Promise<number> {
  console.log(`🧹 Cleaning up old deployments (keeping last ${keepCount} per service)...`);
  
  let deleted = 0;

  try {
    // Get all services
    const services = await prisma.service.findMany({
      select: { id: true },
    });

    for (const service of services) {
      // Get deployments for this service, ordered by creation date
      const deployments = await prisma.deployment.findMany({
        where: { serviceId: service.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      // Delete deployments beyond keepCount
      if (deployments.length > keepCount) {
        const toDelete = deployments.slice(keepCount);
        
        await prisma.deployment.deleteMany({
          where: {
            id: { in: toDelete.map(d => d.id) },
          },
        });

        deleted += toDelete.length;
      }
    }

    console.log(`✅ Deleted ${deleted} old deployments`);
    return deleted;
  } catch (error) {
    console.error('❌ Deployment cleanup failed:', error);
    throw error;
  }
}

/**
 * Cleanup failed deployments older than specified hours
 */
export async function cleanupFailedDeployments(olderThanHours: number = 24): Promise<number> {
  console.log(`🧹 Cleaning up failed deployments older than ${olderThanHours} hours...`);
  
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

  try {
    // Find failed services with old deployments
    const failedServices = await prisma.service.findMany({
      where: {
        status: 'FAILED',
        containerId: { not: null },
        updatedAt: { lt: cutoffDate },
      },
    });

    let cleaned = 0;
    for (const service of failedServices) {
      if (service.containerId) {
        try {
          await removeContainer(service.containerId);
          await prisma.service.update({
            where: { id: service.id },
            data: { containerId: null },
          });
          cleaned++;
        } catch (error) {
          console.error(`  Failed to remove container for service ${service.id}:`, error);
        }
      }
    }

    console.log(`✅ Cleaned up ${cleaned} failed service containers`);
    return cleaned;
  } catch (error) {
    console.error('❌ Failed deployment cleanup failed:', error);
    throw error;
  }
}

/**
 * Run all cleanup tasks
 */
export async function runAllCleanupTasks(): Promise<void> {
  console.log('\n🧹 Running all cleanup tasks...\n');
  
  await cleanupOrphanedContainers();
  await cleanupOldDeployments(10);
  await cleanupFailedDeployments(24);
  
  console.log('\n✅ All cleanup tasks complete\n');
}
