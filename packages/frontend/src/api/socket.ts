import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('token');
    
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
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
  
  socket.emit('subscribe:deployment', deploymentId);
  socket.on('deployment:log', onLog);
  socket.on('deployment:status', onStatus);

  return () => {
    socket.emit('unsubscribe:deployment', deploymentId);
    socket.off('deployment:log', onLog);
    socket.off('deployment:status', onStatus);
  };
}

// Subscribe to service metrics
export function subscribeToService(
  serviceId: string,
  onMetrics: (data: any) => void,
  onStatus: (data: { status: string }) => void
) {
  const socket = getSocket();
  
  socket.emit('subscribe:service', serviceId);
  socket.on('service:metrics', onMetrics);
  socket.on('service:status', onStatus);

  return () => {
    socket.emit('unsubscribe:service', serviceId);
    socket.off('service:metrics', onMetrics);
    socket.off('service:status', onStatus);
  };
}
