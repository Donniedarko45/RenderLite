import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Docker from 'dockerode';
import {
  REDIS_CHANNELS,
  ServiceStatus,
  type JWTPayload,
  type RealtimeEvent,
} from '@renderlite/shared';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const METRICS_INTERVAL_MS = 5000;

export function setupSocketHandlers(io: Server) {
  const redisSubscriber = redis.duplicate();
  const subscribedServices = new Set<string>();

  const removeServiceIfNoListeners = (serviceId: string) => {
    const room = io.sockets.adapter.rooms.get(`service:${serviceId}`);
    if (!room || room.size === 0) {
      subscribedServices.delete(serviceId);
    }
  };

  const emitMetricsForSubscribers = async () => {
    for (const serviceId of [...subscribedServices]) {
      const room = io.sockets.adapter.rooms.get(`service:${serviceId}`);
      if (!room || room.size === 0) {
        subscribedServices.delete(serviceId);
        continue;
      }

      try {
        const service = await prisma.service.findUnique({
          where: { id: serviceId },
          select: { id: true, containerId: true, status: true },
        });

        if (!service || !service.containerId || service.status !== ServiceStatus.RUNNING) {
          continue;
        }

        const container = docker.getContainer(service.containerId);
        const stats = await container.stats({ stream: false });

        const cpuDelta =
          stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPercent =
          systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

        const memoryUsage = stats.memory_stats.usage || 0;
        const memoryLimit = stats.memory_stats.limit || 1;
        const memoryPercent = (memoryUsage / memoryLimit) * 100;

        let networkRx = 0;
        let networkTx = 0;
        if (stats.networks) {
          for (const iface of Object.values(stats.networks) as any[]) {
            networkRx += iface.rx_bytes || 0;
            networkTx += iface.tx_bytes || 0;
          }
        }

        const metrics = {
          cpuPercent: Math.round(cpuPercent * 100) / 100,
          memoryUsage,
          memoryLimit,
          memoryPercent: Math.round(memoryPercent * 100) / 100,
          networkRx,
          networkTx,
          timestamp: new Date().toISOString(),
        };

        io.to(`service:${serviceId}`).emit('service:metrics', {
          serviceId,
          metrics,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        if (error?.statusCode === 404) {
          await prisma.service.update({
            where: { id: serviceId },
            data: { containerId: null, status: ServiceStatus.STOPPED },
          });
          io.to(`service:${serviceId}`).emit('service:status', {
            serviceId,
            status: ServiceStatus.STOPPED,
            timestamp: new Date().toISOString(),
          });
          subscribedServices.delete(serviceId);
          continue;
        }
        console.error(`Failed to emit metrics for service ${serviceId}:`, error);
      }
    }
  };

  const metricsInterval = setInterval(() => {
    void emitMetricsForSubscribers();
  }, METRICS_INTERVAL_MS);

  const emitRealtimeEvent = (event: RealtimeEvent) => {
    if (event.type === 'deployment:log') {
      io.to(`deployment:${event.deploymentId}`).emit('deployment:log', {
        deploymentId: event.deploymentId,
        log: event.log,
        timestamp: event.timestamp,
      });
      return;
    }

    if (event.type === 'deployment:status') {
      io.to(`deployment:${event.deploymentId}`).emit('deployment:status', {
        deploymentId: event.deploymentId,
        status: event.status,
        containerId: event.containerId,
        timestamp: event.timestamp,
      });
      return;
    }

    if (event.type === 'service:status') {
      io.to(`service:${event.serviceId}`).emit('service:status', {
        serviceId: event.serviceId,
        status: event.status,
        timestamp: event.timestamp,
      });
      return;
    }

    if (event.type === 'service:metrics') {
      io.to(`service:${event.serviceId}`).emit('service:metrics', {
        serviceId: event.serviceId,
        metrics: event.metrics,
        timestamp: event.timestamp,
      });
    }
  };

  redisSubscriber.on('message', (_channel, message) => {
    try {
      const event = JSON.parse(message) as RealtimeEvent;
      emitRealtimeEvent(event);
    } catch (error) {
      console.error('Failed to parse realtime event:', error);
    }
  });

  void redisSubscriber.subscribe(REDIS_CHANNELS.REALTIME_EVENTS).catch((error) => {
    console.error('Failed to subscribe to realtime events:', error);
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const secret = process.env.JWT_SECRET || 'default-secret';
      const decoded = jwt.verify(token, secret) as JWTPayload;
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Client connected: ${socket.id}, User: ${socket.userId}`);

    // Join user-specific room for personal notifications
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Subscribe to deployment logs
    socket.on('subscribe:deployment', (deploymentId: string) => {
      console.log(`Socket ${socket.id} subscribing to deployment ${deploymentId}`);
      socket.join(`deployment:${deploymentId}`);
    });

    // Unsubscribe from deployment logs
    socket.on('unsubscribe:deployment', (deploymentId: string) => {
      socket.leave(`deployment:${deploymentId}`);
    });

    // Subscribe to service metrics
    socket.on('subscribe:service', (serviceId: string) => {
      console.log(`Socket ${socket.id} subscribing to service ${serviceId}`);
      socket.join(`service:${serviceId}`);
      subscribedServices.add(serviceId);
    });

    // Unsubscribe from service metrics
    socket.on('unsubscribe:service', (serviceId: string) => {
      socket.leave(`service:${serviceId}`);
      removeServiceIfNoListeners(serviceId);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Return helper functions for emitting events
  return {
    // Emit log to deployment subscribers
    emitDeploymentLog: (deploymentId: string, log: string) => {
      io.to(`deployment:${deploymentId}`).emit('deployment:log', {
        deploymentId,
        log,
        timestamp: new Date().toISOString(),
      });
    },

    // Emit deployment status change
    emitDeploymentStatus: (deploymentId: string, status: string, containerId?: string) => {
      io.to(`deployment:${deploymentId}`).emit('deployment:status', {
        deploymentId,
        status,
        containerId,
        timestamp: new Date().toISOString(),
      });
    },

    // Emit service status change
    emitServiceStatus: (serviceId: string, status: string) => {
      io.to(`service:${serviceId}`).emit('service:status', {
        serviceId,
        status,
        timestamp: new Date().toISOString(),
      });
    },

    // Emit metrics update
    emitServiceMetrics: (serviceId: string, metrics: any) => {
      io.to(`service:${serviceId}`).emit('service:metrics', {
        serviceId,
        metrics,
        timestamp: new Date().toISOString(),
      });
    },
    close: async () => {
      clearInterval(metricsInterval);
      redisSubscriber.removeAllListeners('message');
      try {
        await redisSubscriber.unsubscribe(REDIS_CHANNELS.REALTIME_EVENTS);
      } catch (error) {
        console.error('Failed to unsubscribe realtime events:', error);
      }
      try {
        await redisSubscriber.quit();
      } catch (error) {
        console.error('Failed to close redis subscriber:', error);
      }
    },
  };
}

export type SocketHandlers = ReturnType<typeof setupSocketHandlers>;
