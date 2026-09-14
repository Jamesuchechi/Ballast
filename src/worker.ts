import 'dotenv/config';
import http from 'http';
import { Worker, Job } from 'bullmq';
import { fileURLToPath } from 'url';
import { BRIEF_QUEUE_NAME, BriefJobData } from './queue/briefQueue';
import { ACTION_QUEUE_NAME, ActionJobData } from './queue/actionQueue';
import { createRedisClient } from './queue/redis';
import { processQueuedBrief } from './core/pipelineWorker';
import { executeAction } from './core/actionExecutor';
import { CronExpressionParser } from 'cron-parser';
import { query, queryOne } from './db/client';
import { runSchedule } from './core/scheduler';

let briefsProcessedCount = 0;
let actionsProcessedCount = 0;
let schedulesTriggeredCount = 0;
let heartbeatInterval: NodeJS.Timeout | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;
let isCheckingSchedules = false;
let httpServer: http.Server | null = null;

export function startHeartbeat(intervalMs: number = 60000): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  heartbeatInterval = setInterval(() => {
    const uptimeSec = Math.floor(process.uptime());
    console.log(
      `[Worker Heartbeat] Ballast background worker alive (uptime: ${uptimeSec}s, briefs: ${briefsProcessedCount}, actions: ${actionsProcessedCount}, schedules triggered: ${schedulesTriggeredCount})`
    );
  }, intervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Evaluates active cron schedules, comparing against current time.
 * Uses atomic conditional UPDATE on last_triggered_at to prevent double-firing
 * across worker restarts or multiple instances.
 */
export async function checkAndTriggerDueSchedules(): Promise<number> {
  if (isCheckingSchedules) {
    return 0;
  }
  isCheckingSchedules = true;

  const now = new Date();
  let firedInCheck = 0;

  try {
    const schedules = await query<{
      id: string;
      workspace_id: string;
      cron: string;
      name: string | null;
      last_triggered_at: string | null;
      last_run_brief_id: string | null;
    }>(
      `SELECT id, workspace_id, cron, name, last_triggered_at, last_run_brief_id 
       FROM schedules 
       WHERE enabled = true`
    );

    for (const sched of schedules) {
      try {
        const interval = CronExpressionParser.parse(sched.cron, { currentDate: now });
        const prevScheduled = interval.prev().toDate();
        const diffMs = now.getTime() - prevScheduled.getTime();

        // Check if schedule was due within the last 65 seconds (1-minute window)
        if (diffMs >= 0 && diffMs <= 65000) {
          // Double-firing guard: check if already triggered for this cron window
          if (sched.last_triggered_at) {
            const lastTriggered = new Date(sched.last_triggered_at);
            if (lastTriggered.getTime() >= prevScheduled.getTime() - 1000) {
              continue;
            }
          }

          // Atomic row lock / update: claim the execution slot exclusively
          const acquired = await queryOne<{ id: string }>(
            `UPDATE schedules 
             SET last_triggered_at = NOW() 
             WHERE id = $1 
               AND enabled = true 
               AND (last_triggered_at IS NULL OR last_triggered_at < $2)
             RETURNING id`,
            [sched.id, prevScheduled.toISOString()]
          );

          if (!acquired) {
            // Already claimed by concurrent check or restarted worker
            continue;
          }

          console.log(
            `[Scheduler] Firing due schedule "${sched.name || sched.id}" (cron: "${sched.cron}", due: ${prevScheduled.toISOString()})`
          );

          await runSchedule(sched.id);
          schedulesTriggeredCount++;
          firedInCheck++;
        }
      } catch (cronErr: any) {
        console.error(`[Scheduler] Error evaluating cron "${sched.cron}" for schedule ${sched.id}:`, cronErr.message);
      }
    }
  } catch (err: any) {
    console.error('[Scheduler] Error checking due schedules:', err);
  } finally {
    isCheckingSchedules = false;
  }

  return firedInCheck;
}

export function startSchedulerLoop(intervalMs: number = 60000): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Run an immediate check on startup
  checkAndTriggerDueSchedules().catch((err) => {
    console.error('[Scheduler] Initial schedule check error:', err);
  });

  schedulerInterval = setInterval(() => {
    checkAndTriggerDueSchedules().catch((err) => {
      console.error('[Scheduler] Periodic schedule check error:', err);
    });
  }, intervalMs);

  console.log(`[Scheduler] Autonomous cron scheduler loop active (polling every ${intervalMs / 1000}s)`);
}

export function stopSchedulerLoop(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export function logEnvironmentStatus(): void {
  const hasDb = Boolean(process.env.DATABASE_URL);
  const hasRedis = Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasMistral = Boolean(process.env.MISTRAL_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);

  console.log('[Worker Env] Connecting with configurations:');
  console.log(`  - DATABASE_URL: ${hasDb ? 'Configured' : 'Missing (falling back to default)'}`);
  console.log(`  - REDIS_URL: ${hasRedis ? 'Configured' : 'Missing (falling back to default)'}`);
  console.log(`  - LLM Providers: Gemini=${hasGemini}, Groq=${hasGroq}, Mistral=${hasMistral}, OpenRouter=${hasOpenRouter}`);
}

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

      briefsProcessedCount++;
      console.log(`[BriefWorker] Completed job ${job.id} for brief ${briefId} (status: ${result.status}, total briefs: ${briefsProcessedCount})`);
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

      actionsProcessedCount++;
      console.log(`[ActionWorker] Successfully executed action ${actionId} (executed_at: ${updatedAction.executed_at}, total actions: ${actionsProcessedCount})`);
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

export function startHttpServer(
  port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 10000
): http.Server {
  if (httpServer) {
    return httpServer;
  }

  httpServer = http.createServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url === '/health' || url === '/ping' || url === '/wake' || url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptimeSec: Math.floor(process.uptime()),
          briefsProcessed: briefsProcessedCount,
          actionsProcessed: actionsProcessedCount,
          schedulesTriggered: schedulesTriggeredCount,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  httpServer.listen(port, () => {
    console.log(`[Worker HTTP] Health & wake server listening on port ${port}`);
  });

  return httpServer;
}

export function stopHttpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (httpServer) {
      httpServer.close(() => {
        httpServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export async function startWorker(): Promise<{
  briefWorker: Worker<BriefJobData>;
  actionWorker: Worker<ActionJobData>;
}> {
  console.log(`[Worker] Ballast async worker starting on queues "${BRIEF_QUEUE_NAME}" & "${ACTION_QUEUE_NAME}"...`);
  logEnvironmentStatus();

  // Start HTTP health/wake server (enables Render Free Tier Web Service deployment)
  startHttpServer();

  const briefWorker = createBriefWorker(2);
  const actionWorker = createActionWorker(2);

  // Start 60s periodic log heartbeat for Render liveness visibility
  startHeartbeat(60000);

  // Start 60s autonomous cron scheduler loop
  startSchedulerLoop(60000);

  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}. Gracefully stopping workers...`);
    stopHeartbeat();
    stopSchedulerLoop();
    await stopHttpServer();
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
