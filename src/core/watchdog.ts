import { query } from '@/db/client';

export interface WatchdogResult {
  interruptedBriefIds: string[];
  count: number;
}

/**
 * Watchdog stub:
 * Inspects briefs in 'running' status past the specified timeout and updates
 * them to status='failed' with error='generation interrupted'.
 */
export async function runWatchdog(timeoutSeconds = 60): Promise<WatchdogResult> {
  const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString();

  // Find briefs running longer than cutoff
  const staleBriefs = await query<{ id: string }>(
    `SELECT id FROM briefs 
     WHERE status = 'running' AND as_of <= $1`,
    [cutoff]
  );

  if (staleBriefs.length === 0) {
    return { interruptedBriefIds: [], count: 0 };
  }

  const ids = staleBriefs.map((b) => b.id);

  await query(
    `UPDATE briefs 
     SET status = 'failed', 
         error = 'generation interrupted',
         progress = progress || '[{"step": "failed", "state": "error", "message": "generation interrupted"}]'::jsonb
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  return {
    interruptedBriefIds: ids,
    count: ids.length,
  };
}
