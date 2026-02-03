import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import passport from 'passport';

import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { configurePassport } from './config/passport.js';
import { authRouter } from './routes/auth.js';
import { projectRouter } from './routes/projects.js';
import { serviceRouter } from './routes/services.js';
import { deploymentRouter } from './routes/deployments.js';
import { metricsRouter } from './routes/metrics.js';
import { setupSocketHandlers } from './socket/index.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// Configure Passport
configurePassport();

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

// Routes
app.use('/auth', authRouter);
app.use('/api/projects', projectRouter);
app.use('/api/services', serviceRouter);
app.use('/api/deployments', deploymentRouter);
app.use('/api/metrics', metricsRouter);

// Error handler
app.use(errorHandler);

// Socket.io setup
setupSocketHandlers(io);

// Make io accessible to routes
app.set('io', io);

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  await redis.quit();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

httpServer.listen(PORT, () => {
  console.log(`🚀 RenderLite API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export { io };
