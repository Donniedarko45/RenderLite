import { Queue } from 'bullmq';
import { redis } from './redis.js';
import { QUEUES } from '@renderlite/shared';

export const buildQueue = new Queue(QUEUES.BUILD, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const cleanupQueue = new Queue(QUEUES.CLEANUP, {
  connection: redis,
});
