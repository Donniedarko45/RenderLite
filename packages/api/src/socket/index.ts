import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@renderlite/shared';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupSocketHandlers(io: Server) {
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
    });

    // Unsubscribe from service metrics
    socket.on('unsubscribe:service', (serviceId: string) => {
      socket.leave(`service:${serviceId}`);
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
    emitServiceStatus: (serviceId: string, status: string, userId: string) => {
      io.to(`user:${userId}`).emit('service:status', {
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
  };
}

export type SocketHandlers = ReturnType<typeof setupSocketHandlers>;
