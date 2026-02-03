import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import Docker from 'dockerode';

export const metricsRouter = Router();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// All routes require authentication
metricsRouter.use(authenticate);

// Get container stats for a service
metricsRouter.get('/service/:id', async (req: AuthRequest, res, next) => {
  try {
    const service = await prisma.service.findFirst({
      where: {
        id: req.params.id,
        project: {
          userId: req.user!.id,
        },
      },
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    if (!service.containerId) {
      return res.json({
        serviceId: service.id,
        status: service.status,
        metrics: null,
        message: 'No container running',
      });
    }

    try {
      const container = docker.getContainer(service.containerId);
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

      // Calculate memory
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 1;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;

      // Calculate network
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        for (const iface of Object.values(stats.networks) as any[]) {
          networkRx += iface.rx_bytes || 0;
          networkTx += iface.tx_bytes || 0;
        }
      }

      res.json({
        serviceId: service.id,
        containerId: service.containerId,
        status: service.status,
        metrics: {
          cpuPercent: Math.round(cpuPercent * 100) / 100,
          memoryUsage,
          memoryLimit,
          memoryPercent: Math.round(memoryPercent * 100) / 100,
          networkRx,
          networkTx,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (dockerError: any) {
      // Container might not exist anymore
      if (dockerError.statusCode === 404) {
        await prisma.service.update({
          where: { id: service.id },
          data: { containerId: null, status: 'STOPPED' },
        });
        
        return res.json({
          serviceId: service.id,
          status: 'STOPPED',
          metrics: null,
          message: 'Container not found',
        });
      }
      throw dockerError;
    }
  } catch (error) {
    next(error);
  }
});

// Get dashboard overview stats
metricsRouter.get('/overview', async (req: AuthRequest, res, next) => {
  try {
    const [projectCount, serviceCount, deploymentStats] = await Promise.all([
      prisma.project.count({
        where: { userId: req.user!.id },
      }),
      prisma.service.count({
        where: {
          project: { userId: req.user!.id },
        },
      }),
      prisma.deployment.groupBy({
        by: ['status'],
        where: {
          service: {
            project: { userId: req.user!.id },
          },
        },
        _count: true,
      }),
    ]);

    const runningServices = await prisma.service.count({
      where: {
        project: { userId: req.user!.id },
        status: 'RUNNING',
      },
    });

    const deploymentsByStatus = deploymentStats.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      projects: projectCount,
      services: serviceCount,
      runningServices,
      deployments: deploymentsByStatus,
    });
  } catch (error) {
    next(error);
  }
});
