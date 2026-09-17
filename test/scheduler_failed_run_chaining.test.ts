import { pool, query, queryOne } from '../src/db/client';
import { runSchedule } from '../src/core/scheduler';

async function runTest() {
  console.log('=== Ballast M6: Scheduled Run Chaining on Failed Briefs Test Suite ===\n');

  try {
    console.log('[Test 1] Setting up test workspace and schedule...');
    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('M6 Fail Chain Workspace', 'operator')
      RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;

    const schedRes = await pool.query<{ id: string }>(`
      INSERT INTO schedules (
        workspace_id, name, question_template, cron, timezone, mode, enabled
      ) VALUES (
        $1, 'Weekly Recurring Check', 'Summary for {{date}}', '0 9 * * 1', 'UTC', 'home', true
      ) RETURNING id;
    `, [workspaceId]);
    const scheduleId = schedRes.rows[0].id;

    // ----------------------------------------------------
    // Run 1: First Brief Published Successfully
    // ----------------------------------------------------
    console.log('\n[Test 2] Triggering Run 1 (Initial Successful Brief A)...');
    const run1 = await runSchedule(scheduleId);
    console.log('  Run 1 created queued brief:', run1.briefId, 'Parent:', run1.parentBriefId);
    if (run1.parentBriefId !== null) {
      throw new Error(`Expected initial run to have null parentBriefId, got: ${run1.parentBriefId}`);
    }

    // Publish Brief A
    await query(
      `UPDATE briefs SET status = 'published', markdown = '# Brief A\nInitial verified baseline.', published_at = NOW() WHERE id = $1`,
      [run1.briefId]
    );
    await query(
      `UPDATE schedules SET last_run_brief_id = $1 WHERE id = (
        SELECT schedule_id FROM briefs WHERE id = $1 AND schedule_id IS NOT NULL
      )`,
      [run1.briefId]
    );

    const schedAfter1 = await queryOne<{ last_run_brief_id: string }>(
      `SELECT last_run_brief_id FROM schedules WHERE id = $1`,
      [scheduleId]
    );
    if (schedAfter1?.last_run_brief_id !== run1.briefId) {
      throw new Error(`Expected schedule last_run_brief_id to be Brief A (${run1.briefId}), got: ${schedAfter1?.last_run_brief_id}`);
    }
    console.log('  Passed: Schedule last_run_brief_id is now Brief A.');

    // ----------------------------------------------------
    // Run 2: Second Brief (Brief B) Fails during execution
    // ----------------------------------------------------
    console.log('\n[Test 3] Triggering Run 2 (Brief B which will fail in pipeline)...');
    const run2 = await runSchedule(scheduleId);
    console.log('  Run 2 created queued brief:', run2.briefId, 'Parent:', run2.parentBriefId);
    if (run2.parentBriefId !== run1.briefId) {
      throw new Error(`Expected Run 2 to chain to Brief A (${run1.briefId}), got: ${run2.parentBriefId}`);
    }

    // Check last_run_brief_id while Run 2 is processing
    const schedDuring2 = await queryOne<{ last_run_brief_id: string }>(
      `SELECT last_run_brief_id FROM schedules WHERE id = $1`,
      [scheduleId]
    );
    if (schedDuring2?.last_run_brief_id !== run1.briefId) {
      throw new Error(`Schedule last_run_brief_id prematurely advanced before publish! Expected Brief A, got: ${schedDuring2?.last_run_brief_id}`);
    }

    // Simulate pipeline failure on Brief B (e.g. timeout, LLM credit outage)
    await query(
      `UPDATE briefs SET status = 'failed', error = 'Upstream LLM timeout during writer phase' WHERE id = $1`,
      [run2.briefId]
    );

    // Verify schedule still points to Brief A after Brief B failed
    const schedAfterFail = await queryOne<{ last_run_brief_id: string }>(
      `SELECT last_run_brief_id FROM schedules WHERE id = $1`,
      [scheduleId]
    );
    if (schedAfterFail?.last_run_brief_id !== run1.briefId) {
      throw new Error(`Schedule last_run_brief_id must remain Brief A on failed run! Got: ${schedAfterFail?.last_run_brief_id}`);
    }
    console.log('  Passed: Schedule last_run_brief_id remained Brief A after Brief B failed.');

    // ----------------------------------------------------
    // Run 3: Third Brief (Brief C) Re-runs and Chains to Brief A
    // ----------------------------------------------------
    console.log('\n[Test 4] Triggering Run 3 (Brief C) to verify retry correctly chains to Brief A...');
    const run3 = await runSchedule(scheduleId);
    console.log('  Run 3 created queued brief:', run3.briefId, 'Parent:', run3.parentBriefId);
    if (run3.parentBriefId !== run1.briefId) {
      throw new Error(
        `Critical Bug: Run 3 chained to failed Brief B (${run2.briefId}) instead of last published Brief A (${run1.briefId})!`
      );
    }
    console.log('  Passed: Run 3 correctly chained to last successfully published Brief A (not failed Brief B).');

    // Publish Brief C
    await query(
      `UPDATE briefs SET status = 'published', markdown = '# Brief C\nRecovered run after Brief B failed.', published_at = NOW() WHERE id = $1`,
      [run3.briefId]
    );
    await query(
      `UPDATE schedules SET last_run_brief_id = $1 WHERE id = (
        SELECT schedule_id FROM briefs WHERE id = $1 AND schedule_id IS NOT NULL
      )`,
      [run3.briefId]
    );

    const schedAfter3 = await queryOne<{ last_run_brief_id: string }>(
      `SELECT last_run_brief_id FROM schedules WHERE id = $1`,
      [scheduleId]
    );
    if (schedAfter3?.last_run_brief_id !== run3.briefId) {
      throw new Error(`Expected schedule last_run_brief_id to advance to Brief C (${run3.briefId}), got: ${schedAfter3?.last_run_brief_id}`);
    }
    console.log('  Passed: Schedule last_run_brief_id advanced to Brief C after successful publication.');

    // ----------------------------------------------------
    // Run 4: Fourth Brief (Brief D) Chains to Brief C
    // ----------------------------------------------------
    console.log('\n[Test 5] Triggering Run 4 to verify subsequent run chains to Brief C...');
    const run4 = await runSchedule(scheduleId);
    if (run4.parentBriefId !== run3.briefId) {
      throw new Error(`Expected Run 4 to chain to Brief C (${run3.briefId}), got: ${run4.parentBriefId}`);
    }
    console.log('  Passed: Run 4 chained directly to Brief C.');

    // Cleanup
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('\n  Cleaned up test workspace.');

    console.log('\n[PASS] All M6 failed schedule retry and chaining tests passed successfully!\n');
  } finally {
    try {
      const { closeBriefQueue } = await import('../src/queue/briefQueue');
      await closeBriefQueue();
    } catch {}
    await pool.end();
  }
}

runTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[FAIL] M6 test failed:', err);
  process.exit(1);
});
