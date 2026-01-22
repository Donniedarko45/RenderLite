import { Worker } from 'bullmq';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const worker = new Worker('build-queue', async job => {
  console.log(`Processing job ${job.id}`);
  // Job processing logic will go here
}, {
  connection: {
    host: 'localhost',
    port: 6379
  }
});

console.log('Worker started listening on build-queue');
