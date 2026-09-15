import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = localStorage.getItem('token');

  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: (cb) => {
        cb({ token: localStorage.getItem('token') });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to server');
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });
  } else if (!socket.connected && token) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Subscribe to deployment logs
export function subscribeToDeployment(
  deploymentId: string,
  onLog: (data: { log: string; timestamp: string }) => void,
  onStatus: (data: { status: string; containerId?: string }) => void
) {
  const socket = getSocket();

  const logHandler = (data: { deploymentId: string; log: string; timestamp: string }) => {
    if (data.deploymentId === deploymentId) {
      onLog({ log: data.log, timestamp: data.timestamp });
    }
  };

  const statusHandler = (data: {
    deploymentId: string;
    status: string;
    containerId?: string;
  }) => {
    if (data.deploymentId === deploymentId) {
      onStatus({ status: data.status, containerId: data.containerId });
    }
  };

  const subscribe = () => {
    socket.emit('subscribe:deployment', deploymentId);
  };

  if (socket.connected) {
    subscribe();
  }
  socket.on('connect', subscribe);

  socket.on('deployment:log', logHandler);
  socket.on('deployment:status', statusHandler);

  return () => {
    socket.emit('unsubscribe:deployment', deploymentId);
    socket.off('connect', subscribe);
    socket.off('deployment:log', logHandler);
    socket.off('deployment:status', statusHandler);
  };
}

// Subscribe to service metrics
export function subscribeToService(
  serviceId: string,
  onMetrics: (data: any) => void,
  onStatus: (data: { status: string }) => void
) {
  const socket = getSocket();

  const metricsHandler = (data: { serviceId: string; metrics: any; timestamp: string }) => {
    if (data.serviceId === serviceId) {
      onMetrics(data);
    }
  };
  const statusHandler = (data: { serviceId: string; status: string; timestamp: string }) => {
    if (data.serviceId === serviceId) {
      onStatus({ status: data.status });
    }
  };

  socket.emit('subscribe:service', serviceId);
  socket.on('service:metrics', metricsHandler);
  socket.on('service:status', statusHandler);

  return () => {
    socket.emit('unsubscribe:service', serviceId);
    socket.off('service:metrics', metricsHandler);
    socket.off('service:status', statusHandler);
  };
}
