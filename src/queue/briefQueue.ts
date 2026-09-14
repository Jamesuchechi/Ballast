import { Queue } from 'bullmq';
import { createRedisClient } from './redis';
import { wakeWorker } from '../utils/wakeWorker';

export const BRIEF_QUEUE_NAME = 'ballast-briefs';

export interface BriefJobData {
  briefId: string;
  workspaceId?: string;
  options?: {
    costCap?: number;
  };
}

let briefQueueInstance: Queue<BriefJobData> | null = null;

/**
 * Returns the singleton BullMQ Queue instance for Ballast brief generation.
 */
export function getBriefQueue(): Queue<BriefJobData> {
  if (!briefQueueInstance) {
    const connection = createRedisClient();
    briefQueueInstance = new Queue<BriefJobData>(BRIEF_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 86400, // 24 hours
          count: 500,
        },
        removeOnFail: {
          age: 86400 * 7, // 7 days
        },
      },
    });
  }
  return briefQueueInstance;
}

/**
 * Enqueues a brief generation job into BullMQ backed by Redis / Upstash.
 * Uses briefId as the BullMQ jobId to guarantee idempotency.
 */
export async function enqueueBriefJob(
  briefId: string,
  options?: { costCap?: number; workspaceId?: string }
): Promise<string> {
  const queue = getBriefQueue();
  const job = await queue.add(
    'process-brief',
    {
      briefId,
      workspaceId: options?.workspaceId,
      options: { costCap: options?.costCap },
    },
    {
      jobId: `brief-${briefId}`,
    }
  );

  // Trigger wake-up ping for Render Free Tier if configured
  wakeWorker();

  return job.id!;
}

/**
 * Closes queue connection for graceful teardown or test cleanup.
 */
export async function closeBriefQueue(): Promise<void> {
  if (briefQueueInstance) {
    await briefQueueInstance.close();
    briefQueueInstance = null;
  }
}
