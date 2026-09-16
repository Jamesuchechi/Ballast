import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

import { query, pool } from '../src/db/client';
import { ingestPastedSnippet } from '../src/core/ingest';
import { retrievePrivateChunks, DEFAULT_MAX_DISTANCE } from '../src/core/retrieval';

async function runRetrievalTests() {
  console.log('=== Ballast Vector Retrieval Similarity Threshold Test Suite ===\n');

  const wsId = randomUUID();

  try {
    await query(`INSERT INTO workspaces (id, name, plan) VALUES ($1, 'Test Threshold WS', 'free')`, [wsId]);

    // 1. Ingest relevant document and irrelevant document
    console.log('[Setup] Ingesting documents for distance threshold testing...');
    const relevantDoc = `Stripe billing subscription webhooks:
The Stripe webhook signature verification handler is deployed to staging.
Alex confirmed merchant accounts configuration in Stripe billing dashboard.
Database migrations for billing tiers are complete.`;

    const irrelevantDoc = `Astronomy and deep space telescope calibration:
The James Webb Space Telescope optical alignment of beryllium mirror segments
is completed for infrared spectroscopy observation of distant galactic clusters.`;

    const s1 = await ingestPastedSnippet(wsId, 'stripe_billing.txt', relevantDoc);
    const s2 = await ingestPastedSnippet(wsId, 'space_telescope.txt', irrelevantDoc);

    assert.ok(s1.chunkCount > 0, 'Ingested billing doc');
    assert.ok(s2.chunkCount > 0, 'Ingested space telescope doc');

    // 2. Test standard retrieval returns quotes with distance and similarity metadata
    console.log('\n[Test 1] Retrieving with default threshold...');
    const resDefault = await retrievePrivateChunks({
      workspaceId: wsId,
      queryText: 'Stripe webhook subscription handler',
      limit: 5,
    });

    assert.ok(resDefault.quotes.length > 0, 'Should return matching chunks');
    for (const q of resDefault.quotes) {
      assert.equal(typeof q.distance, 'number', 'Quote must have numeric distance');
      assert.equal(typeof q.similarity, 'number', 'Quote must have numeric similarity');
      assert.ok(q.distance! <= DEFAULT_MAX_DISTANCE, `Distance ${q.distance} must be <= DEFAULT_MAX_DISTANCE (${DEFAULT_MAX_DISTANCE})`);
      console.log(`  Quote [${q.id}]: dist=${q.distance?.toFixed(4)}, sim=${q.similarity?.toFixed(4)} | text: ${q.quote.slice(0, 45)}...`);
    }
    console.log('✓ Distance and similarity fields populated and within threshold');

    // 3. Test strict threshold filtering out irrelevant chunks
    console.log('\n[Test 2] Retrieving with ultra-strict maxDistance=0.001 (should return empty without crashing)...');
    const resStrict = await retrievePrivateChunks({
      workspaceId: wsId,
      queryText: 'Completely unrelated query about cooking recipes and pasta sauce',
      maxDistance: 0.001,
      limit: 5,
    });

    assert.equal(resStrict.quotes.length, 0, 'Ultra-strict threshold must filter out non-matching chunks');
    console.log('✓ Strict distance cutoff successfully filtered low-relevance chunks');

  } finally {
    // Cleanup
    await query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);
    await pool.end();
  }

  console.log('\n=== ALL RETRIEVAL THRESHOLD TESTS PASSED ===');
}

runRetrievalTests().catch((err) => {
  console.error('❌ Retrieval Threshold Test Failed:', err);
  pool.end();
  process.exit(1);
});
