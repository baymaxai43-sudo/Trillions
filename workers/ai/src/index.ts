import { Worker } from 'bullmq';

// Worker for AI and agent jobs. Each job carries a task id, owner, budget and cancellation flag.
const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };

new Worker(
  'ai',
  async (job) => {
    console.log(`[ai] job ${job.id} ${job.name}`);
    return { ok: true };
  },
  { connection, concurrency: 4 },
);
