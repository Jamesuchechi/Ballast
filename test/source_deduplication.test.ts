import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { query, queryOne, pool } from '../src/db/client';
import { gmailConnector } from '../src/connectors/gmail';
import { gitHubConnector } from '../src/connectors/github';
import { driveConnector } from '../src/connectors/drive';
import { ingestDocument } from '../src/core/ingest';

describe('Source deduplication & external_id unique constraint suite (Task D3)', () => {
  const testWsId = 'b3000000-0000-0000-0000-000000000001';
  const testUserId = 'b3000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'dedup@ballast.local', 'hash_test', 'Dedup Test User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES ($1, 'Dedup Workspace', 'operator')
       ON CONFLICT (id) DO UPDATE SET plan = 'operator'`,
      [testWsId]
    );

    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [testWsId, testUserId]
    );

    await query(`DELETE FROM chunks WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [testWsId]);
  });

  after(async () => {
    await query(`DELETE FROM chunks WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [testWsId]);
    await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    await pool.end();
  });

  test('Database enforces UNIQUE index on (workspace_id, connector, external_id)', async () => {
    const extId = 'ext_unique_test_1';
    await query(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, trust_boundary)
       VALUES ($1, 'gmail', $2, 'checksum_1', 'untrusted_content')`,
      [testWsId, extId]
    );

    // Attempting a second insert with the same (workspace_id, connector, external_id) must throw unique violation
    let didThrowUnique = false;
    try {
      await query(
        `INSERT INTO sources (workspace_id, connector, external_id, checksum, trust_boundary)
         VALUES ($1, 'gmail', $2, 'checksum_2', 'untrusted_content')`,
        [testWsId, extId]
      );
    } catch (err: any) {
      didThrowUnique = true;
      assert.match(err.message, /unique constraint|duplicate key|idx_sources_workspace_connector_external/i);
    }

    assert.equal(didThrowUnique, true, 'Duplicate (workspace_id, connector, external_id) insert must be rejected by PostgreSQL');

    // Clean up
    await query(`DELETE FROM sources WHERE workspace_id = $1 AND external_id = $2`, [testWsId, extId]);
  });

  test('Connector sync handles unchanged items as unchanged without duplicating source rows', async () => {
    process.env.EVAL_USE_MOCK = 'true';

    // First sync: creates source rows
    const firstSync = await gitHubConnector.sync({ workspaceId: testWsId });
    assert.ok(firstSync.syncedCount >= 1, 'First sync should ingest items');

    const sourceCount1 = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM sources WHERE workspace_id = $1 AND connector = 'github'`,
      [testWsId]
    );
    const initialSources = parseInt(sourceCount1[0].count, 10);
    assert.ok(initialSources >= 1);

    // Second sync of unchanged items: should mark unchanged and not create duplicate source rows
    const secondSync = await gitHubConnector.sync({ workspaceId: testWsId });
    assert.equal(secondSync.syncedCount, 0, 'No items should be re-synced if unchanged');
    assert.equal(secondSync.unchangedCount, initialSources, 'All items should be marked unchanged');

    const sourceCount2 = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM sources WHERE workspace_id = $1 AND connector = 'github'`,
      [testWsId]
    );
    assert.equal(parseInt(sourceCount2[0].count, 10), initialSources, 'Source count must remain identical');
  });

  test('Connector sync handles updated items by updating existing source and replacing chunks', async () => {
    process.env.EVAL_USE_MOCK = 'true';

    const gmailSync1 = await gmailConnector.sync({ workspaceId: testWsId });
    assert.ok(gmailSync1.syncedCount >= 1);

    const initialSource = await queryOne<{ id: string; checksum: string }>(
      `SELECT id, checksum FROM sources WHERE workspace_id = $1 AND connector = 'gmail' LIMIT 1`,
      [testWsId]
    );
    assert.ok(initialSource);

    // Get initial chunk count
    const initialChunks = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM chunks WHERE source_id = $1`,
      [initialSource.id]
    );
    const initialChunkCount = parseInt(initialChunks[0].count, 10);
    assert.ok(initialChunkCount >= 1);

    // Simulate an external update to this email thread by modifying the database checksum to simulate a stale checksum
    await query(
      `UPDATE sources SET checksum = 'old_stale_checksum_value' WHERE id = $1`,
      [initialSource.id]
    );

    // Re-sync: connector should notice external_id matches but checksum differs, updating source and replacing chunks
    const gmailSync2 = await gmailConnector.sync({ workspaceId: testWsId });
    assert.ok(gmailSync2.syncedCount >= 1, 'Updated item should be processed as synced');

    // Verify no duplicate source was created
    const totalGmailSources = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM sources WHERE workspace_id = $1 AND connector = 'gmail'`,
      [testWsId]
    );
    assert.equal(parseInt(totalGmailSources[0].count, 10), gmailSync1.syncedCount, 'Total sources must not increase on update');

    // Verify chunks still exist and are attached to the same sourceId
    const updatedChunks = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM chunks WHERE source_id = $1`,
      [initialSource.id]
    );
    assert.ok(parseInt(updatedChunks[0].count, 10) >= 1, 'Chunks must be re-embedded for the source');
  });

  test('ingestDocument deduplicates identical uploads and cleanly updates modified uploads with same filename', async () => {
    const filename = 'quarterly_report.txt';
    const content1 = 'Q1 Financial Summary: Total revenue $5.0M with 30% gross margin.';
    const buffer1 = Buffer.from(content1, 'utf-8');

    // 1. Initial ingestion
    const res1 = await ingestDocument({
      workspaceId: testWsId,
      filename,
      buffer: buffer1,
    });
    assert.equal(res1.deduplicated, false);
    assert.ok(res1.chunkCount >= 1);

    // 2. Ingesting identical file: should return deduplicated = true
    const res2 = await ingestDocument({
      workspaceId: testWsId,
      filename,
      buffer: buffer1,
    });
    assert.equal(res2.deduplicated, true);
    assert.equal(res2.sourceId, res1.sourceId);

    // 3. Ingesting updated file with same filename: should update source and replace chunks without duplicate rows
    const content2 = 'Q1 Financial Summary (Revised): Total revenue updated to $5.4M with 32% gross margin.';
    const buffer2 = Buffer.from(content2, 'utf-8');
    const res3 = await ingestDocument({
      workspaceId: testWsId,
      filename,
      buffer: buffer2,
    });
    assert.equal(res3.deduplicated, false);
    assert.equal(res3.sourceId, res1.sourceId, 'Updated upload must reuse existing source record');

    const totalUploadSources = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM sources WHERE workspace_id = $1 AND connector = 'upload' AND external_id = $2`,
      [testWsId, filename]
    );
    assert.equal(parseInt(totalUploadSources[0].count, 10), 1, 'Only 1 source row should exist for filename');
  });
});
