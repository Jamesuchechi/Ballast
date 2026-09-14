import { Queue } from 'bullmq';
import { createRedisClient } from './redis';
import { wakeWorker } from '../utils/wakeWorker';

export const ACTION_QUEUE_NAME = 'ballast-actions';

export interface ActionJobData {
  actionId: string;
  workspaceId: string;
}

let actionQueueInstance: Queue<ActionJobData> | null = null;

/**
 * Returns the singleton BullMQ Queue instance for Ballast action execution.
 */
export function getActionQueue(): Queue<ActionJobData> {
  if (!actionQueueInstance) {
    const connection = createRedisClient();
    actionQueueInstance = new Queue<ActionJobData>(ACTION_QUEUE_NAME, {
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
  return actionQueueInstance;
}

/**
 * Enqueues an approved action execution job into BullMQ backed by Redis.
 * Uses actionId as the BullMQ jobId to guarantee idempotency.
 */
export async function enqueueActionJob(
  actionId: string,
  workspaceId: string
): Promise<string> {
  const queue = getActionQueue();
  const job = await queue.add(
    'execute-action',
    {
      actionId,
      workspaceId,
    },
    {
      jobId: `action-${actionId}`,
    }
  );

  // Trigger wake-up ping for Render Free Tier if configured
  wakeWorker();

  return job.id!;
}

/**
 * Closes queue connection for graceful teardown or test cleanup.
 */
export async function closeActionQueue(): Promise<void> {
  if (actionQueueInstance) {
    await actionQueueInstance.close();
    actionQueueInstance = null;
  }
}
