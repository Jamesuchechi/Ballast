import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

import { query, pool } from '../src/db/client';
import {
  getRootBriefId,
  areInSameVersionChain,
  diffBriefsInChain,
} from '../src/core/diff';

async function runVersionChainTests() {
  console.log('=== Ballast Version Chain Lineage Test Suite (Bug 9) ===\n');

  const wsId = randomUUID();
  const v1Id = randomUUID();
  const v2Id = randomUUID();
  const v3Id = randomUUID();
  const v4Id = randomUUID();
  const branch2Id = randomUUID();
  const unrelatedId = randomUUID();

  try {
    await query(`INSERT INTO workspaces (id, name, plan) VALUES ($1, 'Chain Test WS', 'pro')`, [wsId]);

    // 1. Create 4-level version chain: v1 (root) -> v2 -> v3 -> v4
    console.log('[Setup] Creating 4-level deep version chain (v1 -> v2 -> v3 -> v4)...');
    await query(
      `INSERT INTO briefs (id, workspace_id, question, markdown, as_of, mode, status, parent_brief_id) VALUES
       ($1, $7, 'Q1', '# Brief v1\nRevenue $1.0M', NOW(), 'home', 'published', NULL),
       ($2, $7, 'Q1', '# Brief v2\nRevenue $1.2M', NOW(), 'home', 'published', $1),
       ($3, $7, 'Q1', '# Brief v3\nRevenue $1.5M', NOW(), 'home', 'published', $2),
       ($4, $7, 'Q1', '# Brief v4\nRevenue $1.8M', NOW(), 'home', 'published', $3),
       ($5, $7, 'Q1', '# Brief branch2\nRevenue $1.1M', NOW(), 'home', 'published', $1),
       ($6, $7, 'Unrelated', '# Unrelated\nDifferent tree', NOW(), 'home', 'published', NULL)`,
      [v1Id, v2Id, v3Id, v4Id, branch2Id, unrelatedId, wsId]
    );

    // Test 1: Self-comparison
    console.log('[Test 1] Testing self-comparison chain length...');
    const selfChain = await areInSameVersionChain(wsId, v1Id, v1Id);
    assert.strictEqual(selfChain.sameChain, true);
    assert.strictEqual(selfChain.chainLength, 1, 'Self comparison should have length 1');

    // Test 2: Direct parent-child (v1 -> v2)
    console.log('[Test 2] Testing direct parent-child (v1 -> v2) chain length...');
    const v1v2 = await areInSameVersionChain(wsId, v1Id, v2Id);
    assert.strictEqual(v1v2.sameChain, true);
    assert.strictEqual(v1v2.chainLength, 2, 'Parent-child should have length 2');

    // Test 3: 3-level chain (v1 -> v2 -> v3)
    console.log('[Test 3] Testing 3-level chain (v1 -> v3) chain length...');
    const v1v3 = await areInSameVersionChain(wsId, v1Id, v3Id);
    assert.strictEqual(v1v3.sameChain, true);
    assert.strictEqual(v1v3.chainLength, 3, 'v1 to v3 should have length 3');

    // Test 4: 4-level chain (v1 -> v4) via diffBriefsInChain
    console.log('[Test 4] Testing 4-level chain (v1 -> v4) via diffBriefsInChain...');
    const diff1to4 = await diffBriefsInChain(wsId, v1Id, v4Id);
    assert.strictEqual(diff1to4.sharedRootId, v1Id);
    assert.strictEqual(diff1to4.versionChainLength, 4, 'Full 4-level chain must report versionChainLength = 4');

    // Test 5: Sub-chain diff (v2 -> v4)
    console.log('[Test 5] Testing intermediate sub-chain (v2 -> v4)...');
    const diff2to4 = await diffBriefsInChain(wsId, v2Id, v4Id);
    assert.strictEqual(diff2to4.sharedRootId, v1Id);
    assert.strictEqual(diff2to4.versionChainLength, 3, 'v2 to v4 must report versionChainLength = 3');

    // Test 6: Branching comparison (branch2 vs v4)
    console.log('[Test 6] Testing branching comparison (branch2 vs v4)...');
    const branchDiff = await areInSameVersionChain(wsId, branch2Id, v4Id);
    assert.strictEqual(branchDiff.sameChain, true);
    assert.strictEqual(branchDiff.rootId, v1Id);
    // branch2 is depth 1 from v1; v4 is depth 3 from v1. Total distance = 1 + 3 + 1 = 5
    assert.strictEqual(branchDiff.chainLength, 5, 'Branching lineage must calculate path length through LCA');

    // Test 7: Unrelated briefs
    console.log('[Test 7] Testing unrelated briefs rejection...');
    const unrelated = await areInSameVersionChain(wsId, v1Id, unrelatedId);
    assert.strictEqual(unrelated.sameChain, false);
    assert.strictEqual(unrelated.chainLength, 0);

    console.log('\n[PASS] All version chain lineage tests passed successfully!');
  } finally {
    await query(`DELETE FROM briefs WHERE workspace_id = $1`, [wsId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);
    await pool.end();
  }
}

runVersionChainTests().catch((err) => {
  console.error('[FAIL] Version chain test failed:', err);
  process.exit(1);
});
