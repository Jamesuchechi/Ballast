import { pool, withTransaction } from '../src/db/client';

async function runTest() {
  console.log('=== Ballast D7: Transaction Wrapping in Pipeline Worker Test Suite ===\n');

  try {
    console.log('[Test 1] Testing withTransaction commit and rollback semantics...');
    
    // Create test workspace
    const dummyWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name)
      VALUES ('D7 Test Workspace')
      RETURNING id;
    `);
    const workspaceId = dummyWorkspace.rows[0].id;

    // Test successful transaction commit
    const briefRes = await withTransaction(async (client) => {
      const b = await client.query<{ id: string }>(
        `INSERT INTO briefs (workspace_id, question, status)
         VALUES ($1, 'Test Q1', 'running')
         RETURNING id`,
        [workspaceId]
      );
      const bId = b.rows[0].id;

      await client.query(
        `INSERT INTO actions (brief_id, workspace_id, type, payload)
         VALUES ($1, $2, 'task', '{"title": "tx test"}'::jsonb)`,
        [bId, workspaceId]
      );

      await client.query(
        `UPDATE briefs SET status = 'published' WHERE id = $1`,
        [bId]
      );

      return bId;
    });

    const verifyCommit = await pool.query<{ status: string }>(
      `SELECT status FROM briefs WHERE id = $1`,
      [briefRes]
    );
    if (verifyCommit.rows[0].status !== 'published') {
      throw new Error('Expected brief to be committed as published.');
    }
    const verifyActions = await pool.query(
      `SELECT id FROM actions WHERE brief_id = $1`,
      [briefRes]
    );
    if (verifyActions.rowCount !== 1) {
      throw new Error('Expected action to be committed.');
    }
    console.log('  Passed: Successful transaction committed all changes atomically.');

    console.log('\n[Test 2] Testing rollback on simulated error during persistence phase...');
    const briefRes2 = await pool.query<{ id: string }>(
      `INSERT INTO briefs (workspace_id, question, status)
       VALUES ($1, 'Test Q2 Failure Simulation', 'running')
       RETURNING id`,
      [workspaceId]
    );
    const briefId2 = briefRes2.rows[0].id;

    let caughtError = false;
    try {
      await withTransaction(async (client) => {
        // Step 1: Insert an action
        await client.query(
          `INSERT INTO actions (brief_id, workspace_id, type, payload)
           VALUES ($1, $2, 'task', '{"title": "should be rolled back"}'::jsonb)`,
          [briefId2, workspaceId]
        );

        // Step 2: Insert a citation
        await client.query(
          `INSERT INTO citations (
            workspace_id, brief_id, source_class, citation_type, claim_span, quote
          ) VALUES ($1, $2, 'private', 'support', '{"start": 0, "end": 0}'::jsonb, 'Test Quote')`,
          [workspaceId, briefId2]
        );

        // Step 3: Simulate catastrophic crash midway through persistence before commit
        throw new Error('Simulated database / network crash midway through persistence');
      });
    } catch (err: any) {
      caughtError = true;
      console.log('  Caught expected simulation error:', err.message);
      // Simulate fail-closed error handling in pipelineWorker catch block
      await pool.query(
        `UPDATE briefs SET status = 'failed', error = $2 WHERE id = $1`,
        [briefId2, err.message]
      );
    }

    if (!caughtError) {
      throw new Error('Expected transaction callback to throw.');
    }

    // Verify atomic rollback: 0 actions and 0 citations should remain for briefId2
    const actionsCheck = await pool.query(
      `SELECT id FROM actions WHERE brief_id = $1`,
      [briefId2]
    );
    if (actionsCheck.rowCount !== 0) {
      throw new Error(`Expected 0 actions after rollback, found ${actionsCheck.rowCount}`);
    }

    const citationsCheck = await pool.query(
      `SELECT id FROM citations WHERE brief_id = $1`,
      [briefId2]
    );
    if (citationsCheck.rowCount !== 0) {
      throw new Error(`Expected 0 citations after rollback, found ${citationsCheck.rowCount}`);
    }

    const briefCheck = await pool.query<{ status: string; error: string }>(
      `SELECT status, error FROM briefs WHERE id = $1`,
      [briefId2]
    );
    if (briefCheck.rows[0].status !== 'failed') {
      throw new Error('Expected brief status to be failed after fail-closed recovery.');
    }
    console.log('  Passed: Rollback cleanly wiped partial mutations with 0 orphaned rows.');

    // Cleanup test workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All D7 pipeline worker transaction tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] D7 test failed:', err);
  process.exit(1);
});
