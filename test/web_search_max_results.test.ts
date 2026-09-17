process.env.NODE_ENV = 'test';
process.env.EVAL_USE_MOCK = 'true';

import { toolRouter, DEFAULT_WEB_MAX_RESULTS } from '../src/core/toolRouter';
import { webConnector, DEFAULT_WEB_MAX_RESULTS as CONNECTOR_DEFAULT_MAX } from '../src/connectors/web';
import { pool, query } from '../src/db/client';

async function runTest() {
  console.log('=== Ballast M9: Web Search maxResults Expansion Test Suite ===\n');

  try {
    console.log('[Test 1] Verifying default maxResults configuration is expanded to 10...');
    if (DEFAULT_WEB_MAX_RESULTS !== 10 || CONNECTOR_DEFAULT_MAX !== 10) {
      throw new Error(`Expected DEFAULT_WEB_MAX_RESULTS to be 10, got toolRouter: ${DEFAULT_WEB_MAX_RESULTS}, connector: ${CONNECTOR_DEFAULT_MAX}`);
    }
    console.log('  Passed: DEFAULT_WEB_MAX_RESULTS is 10 in both toolRouter and webConnector.');

    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name)
      VALUES ('M9 Web Search Test Workspace')
      RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;

    // ----------------------------------------------------
    // Test 2: Execute Web Search with Expanded Default (10)
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing web search execution with expanded default results...');
    const defaultSearch = await toolRouter.executeWebSearch(
      'GDPR compliance Stripe auto-debit consent requirements',
      {
        workspaceId,
        mode: 'world',
        currentCost: 0,
      }
    );
    console.log(`  Received ${defaultSearch.snapshots.length} snapshots with default maxResults.`);
    if (defaultSearch.snapshots.length === 0) {
      throw new Error('Expected snapshots to be returned in World mode web search');
    }
    if (defaultSearch.snapshots.length > 10) {
      throw new Error(`Snapshots exceeded max limit 10, received: ${defaultSearch.snapshots.length}`);
    }
    console.log('  Passed: Default search executed and respected expanded 10-result limit.');

    // ----------------------------------------------------
    // Test 3: Explicit maxResults Override (e.g. maxResults = 8)
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing explicit maxResults = 8 option...');
    const search8 = await webConnector.searchAndSnapshot({
      workspaceId,
      query: 'Stripe webhook security and signature verification',
      maxResults: 8,
    });
    console.log(`  Received ${search8.length} snapshots with maxResults = 8.`);
    if (search8.length > 8) {
      throw new Error(`Expected at most 8 snapshots, got ${search8.length}`);
    }
    console.log('  Passed: Explicit option maxResults = 8 respected.');

    // ----------------------------------------------------
    // Test 4: Clamping Bound Enforcement [1, 20]
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing upper bound clamping (maxResults = 50 clamped to 20)...');
    const clampedSearch = await toolRouter.executeWebSearch(
      'API rate limit headers and 429 backoff strategies',
      {
        workspaceId,
        mode: 'world',
        currentCost: 0,
        maxResults: 50, // Clamped to 20
      }
    );
    console.log(`  Received ${clampedSearch.snapshots.length} snapshots when requested 50.`);
    if (clampedSearch.snapshots.length > 20) {
      throw new Error(`Expected upper bound clamp of 20, got ${clampedSearch.snapshots.length}`);
    }
    console.log('  Passed: Upper bound clamped correctly to 20.');

    // ----------------------------------------------------
    // Test 5: Verify Stored Snapshots in sources and chunks
    // ----------------------------------------------------
    console.log('\n[Test 5] Verifying snapshots stored in sources and chunked into pgvector...');
    const webSources = await query<{ id: string; external_id: string }>(
      `SELECT id, external_id FROM sources WHERE workspace_id = $1 AND connector = 'web'`,
      [workspaceId]
    );
    if (webSources.length === 0) {
      throw new Error('Expected web snapshots to be persisted in sources table');
    }

    const webChunks = await query<{ id: string }>(
      `SELECT c.id FROM chunks c
       JOIN sources s ON s.id = c.source_id
       WHERE s.workspace_id = $1 AND s.connector = 'web'`,
      [workspaceId]
    );
    if (webChunks.length === 0) {
      throw new Error('Expected chunks to be embedded for web snapshots');
    }
    console.log(`  Passed: Persisted ${webSources.length} web source snapshot(s) with ${webChunks.length} embedded chunk(s).`);

    // Cleanup
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('\n  Cleaned up test workspace.');

    console.log('\n[PASS] All M9 web search maxResults tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] M9 test failed:', err);
  process.exit(1);
});
