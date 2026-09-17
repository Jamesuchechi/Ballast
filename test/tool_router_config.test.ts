process.env.NODE_ENV = 'test';
process.env.EVAL_USE_MOCK = 'true';

import { toolRouter, DEFAULT_BRIEF_COST_CAP, DEFAULT_WEB_MAX_RESULTS } from '../src/core/toolRouter';
import { pool } from '../src/db/client';

async function runTest() {
  console.log('=== Ballast D8: Tool Router Configurable Web Results Test Suite ===\n');

  try {
    const dummyWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name)
      VALUES ('D8 Test Workspace')
      RETURNING id;
    `);
    const workspaceId = dummyWorkspace.rows[0].id;

    console.log('[Test 1] Testing default maxResults behavior in World mode...');
    const resDefault = await toolRouter.executeWebSearch('Stripe webhook signatures and GDPR compliance', {
      workspaceId,
      mode: 'world',
      currentCost: 0,
    });
    console.log(`  Received ${resDefault.snapshots.length} snapshots with default config.`);
    if (resDefault.snapshots.length === 0) {
      throw new Error('Expected at least 1 snapshot in world mode search.');
    }
    console.log('  Passed: Default web search executed successfully.');

    console.log('\n[Test 2] Testing explicit maxResults option (e.g., maxResults = 1)...');
    const resLimit1 = await toolRouter.executeWebSearch(
      'Stripe webhook signatures',
      {
        workspaceId,
        mode: 'world',
        currentCost: 0,
      },
      { maxResults: 1 }
    );
    console.log(`  Received ${resLimit1.snapshots.length} snapshots when maxResults = 1.`);
    if (resLimit1.snapshots.length > 1) {
      throw new Error(`Expected at most 1 snapshot, received ${resLimit1.snapshots.length}`);
    }
    console.log('  Passed: Explicit option maxResults = 1 respected.');

    console.log('\n[Test 3] Testing context.maxResults configuration...');
    const resContextLimit = await toolRouter.executeWebSearch('GDPR compliance Article 6', {
      workspaceId,
      mode: 'world',
      currentCost: 0,
      maxResults: 2,
    });
    console.log(`  Received ${resContextLimit.snapshots.length} snapshots with context.maxResults = 2.`);
    if (resContextLimit.snapshots.length > 2) {
      throw new Error(`Expected at most 2 snapshots, received ${resContextLimit.snapshots.length}`);
    }
    console.log('  Passed: context.maxResults respected.');

    console.log('\n[Test 4] Testing WEB_SEARCH_MAX_RESULTS environment variable override...');
    const originalEnv = process.env.WEB_SEARCH_MAX_RESULTS;
    process.env.WEB_SEARCH_MAX_RESULTS = '1';
    try {
      const resEnv = await toolRouter.executeWebSearch('429 Too Many Requests response code', {
        workspaceId,
        mode: 'world',
        currentCost: 0,
      });
      console.log(`  Received ${resEnv.snapshots.length} snapshots with ENV WEB_SEARCH_MAX_RESULTS = 1.`);
      if (resEnv.snapshots.length > 1) {
        throw new Error(`Expected at most 1 snapshot with ENV override, received ${resEnv.snapshots.length}`);
      }
      console.log('  Passed: WEB_SEARCH_MAX_RESULTS environment variable override respected.');
    } finally {
      process.env.WEB_SEARCH_MAX_RESULTS = originalEnv;
    }

    console.log('\n[Test 5] Testing Home mode hard gate exception...');
    let homeGateCaught = false;
    try {
      await toolRouter.executeWebSearch('Forbidden query', {
        workspaceId,
        mode: 'home',
        currentCost: 0,
      });
    } catch (err: any) {
      homeGateCaught = true;
      console.log('  Passed: Caught expected Home mode violation:', err.message);
    }
    if (!homeGateCaught) {
      throw new Error('Expected Home mode web search to throw Tool Router violation.');
    }

    console.log('\n[Test 6] Testing per-brief cost ceiling circuit break...');
    const resCostBreaker = await toolRouter.executeWebSearch('Cost capped search', {
      workspaceId,
      mode: 'world',
      currentCost: 0.05, // Reached cost ceiling
      costCap: 0.05,
    });
    if (!resCostBreaker.circuitBroken || resCostBreaker.snapshots.length !== 0) {
      throw new Error('Expected cost ceiling to circuit break and return 0 snapshots.');
    }
    console.log('  Passed: Cost ceiling circuit broken with message:', resCostBreaker.explanation);

    // Cleanup workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All D8 toolRouter tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] D8 test failed:', err);
  process.exit(1);
});
