import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { fileURLToPath } from 'url';
import { BRIEF_QUEUE_NAME, BriefJobData } from './queue/briefQueue';
import { ACTION_QUEUE_NAME, ActionJobData } from './queue/actionQueue';
import { createRedisClient } from './queue/redis';
import { processQueuedBrief } from './core/pipelineWorker';
import { executeAction } from './core/actionExecutor';

export function createBriefWorker(concurrency: number = 2): Worker<BriefJobData> {
  const connection = createRedisClient();

  const worker = new Worker<BriefJobData>(
    BRIEF_QUEUE_NAME,
    async (job: Job<BriefJobData>) => {
      const { briefId, options } = job.data;
      console.log(`[BriefWorker] Starting job ${job.id} for brief ${briefId}`);

      const result = await processQueuedBrief(briefId, options);
      if (!result) {
        throw new Error(`Pipeline execution failed for brief ${briefId}`);
      }

      console.log(`[BriefWorker] Completed job ${job.id} for brief ${briefId} (status: ${result.status})`);
      return { briefId, status: result.status, title: result.title };
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[BriefWorker] Job ${job.id} succeeded.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[BriefWorker] Job ${job?.id} failed with error:`, err);
  });

  worker.on('error', (err) => {
    console.error('[BriefWorker] Worker internal error:', err);
  });

  return worker;
}

export function createActionWorker(concurrency: number = 2): Worker<ActionJobData> {
  const connection = createRedisClient();

  const worker = new Worker<ActionJobData>(
    ACTION_QUEUE_NAME,
    async (job: Job<ActionJobData>) => {
      const { actionId } = job.data;
      console.log(`[ActionWorker] Starting action job ${job.id} for action ${actionId}`);

      // executeAction internally re-checks:
      // 1. approved_at IS NOT NULL
      // 2. workspace plan is 'operator'
      // 3. provider connection and credentials
      const updatedAction = await executeAction(actionId);

      console.log(`[ActionWorker] Successfully executed action ${actionId} (executed_at: ${updatedAction.executed_at})`);
      return { actionId, executed_at: updatedAction.executed_at };
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[ActionWorker] Job ${job.id} succeeded.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ActionWorker] Job ${job?.id} failed with error:`, err);
  });

  worker.on('error', (err) => {
    console.error('[ActionWorker] Worker internal error:', err);
  });

  return worker;
}

export async function startWorker(): Promise<{
  briefWorker: Worker<BriefJobData>;
  actionWorker: Worker<ActionJobData>;
}> {
  console.log(`[Worker] Ballast async worker starting on queues "${BRIEF_QUEUE_NAME}" & "${ACTION_QUEUE_NAME}"...`);
  const briefWorker = createBriefWorker(2);
  const actionWorker = createActionWorker(2);

  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}. Gracefully stopping workers...`);
    await Promise.all([briefWorker.close(), actionWorker.close()]);
    console.log('[Worker] All workers closed cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { briefWorker, actionWorker };
}

// If invoked directly from CLI
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  startWorker().catch((err) => {
    console.error('[Worker] Fatal error starting worker:', err);
    process.exit(1);
  });
}
