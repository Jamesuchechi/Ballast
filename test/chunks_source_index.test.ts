import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/client';
import { migrate } from '../src/db/migrate';

describe('Chunks source_id index suite (Task D4)', () => {
  before(async () => {
    await migrate();
  });

  after(async () => {
    await pool.end();
  });

  test('Database has idx_chunks_source index on chunks(source_id)', async () => {
    const res = await pool.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'chunks' AND indexname = 'idx_chunks_source';
    `);

    assert.equal(res.rows.length, 1, 'idx_chunks_source must exist in pg_indexes');
    const indexDef = res.rows[0].indexdef.toLowerCase();
    assert.ok(
      indexDef.includes('source_id'),
      `Index definition must include source_id column. Got: ${res.rows[0].indexdef}`
    );
  });

  test('Fast source chunk lookup and delete by source_id', async () => {
    const testWsId = '00000000-0000-0000-0000-000000000001';
    
    // Ensure test workspace exists
    await pool.query(`
      INSERT INTO workspaces (id, name, plan)
      VALUES ($1, 'Test Index Workspace', 'pro')
      ON CONFLICT (id) DO NOTHING;
    `, [testWsId]);

    // Create a source
    const srcRes = await pool.query<{ id: string }>(`
      INSERT INTO sources (workspace_id, connector, external_id, checksum, meta)
      VALUES ($1, 'upload', 'test_idx_doc_1', 'chk123', '{"title": "Index Doc"}'::jsonb)
      ON CONFLICT (workspace_id, connector, external_id) DO UPDATE SET checksum = 'chk123'
      RETURNING id;
    `, [testWsId]);
    const sourceId = srcRes.rows[0].id;

    // Clean up any existing chunks for this source
    await pool.query('DELETE FROM chunks WHERE source_id = $1', [sourceId]);

    // Insert 5 chunk rows
    for (let i = 0; i < 5; i++) {
      await pool.query(`
        INSERT INTO chunks (workspace_id, source_id, ordinal, text)
        VALUES ($1, $2, $3, $4);
      `, [testWsId, sourceId, i, `Chunk content ${i}`]);
    }

    // Query chunks by source_id
    const chunkRows = await pool.query<{ id: string; ordinal: number }>(`
      SELECT id, ordinal FROM chunks WHERE source_id = $1 ORDER BY ordinal ASC;
    `, [sourceId]);
    assert.equal(chunkRows.rows.length, 5, 'Must return 5 chunks for source_id');

    // Delete chunks by source_id
    const deleteRes = await pool.query(`
      DELETE FROM chunks WHERE source_id = $1;
    `, [sourceId]);
    assert.equal(deleteRes.rowCount, 5, 'Must delete exactly 5 chunks by source_id');

    // Verify 0 remaining
    const remaining = await pool.query('SELECT count(*) as count FROM chunks WHERE source_id = $1', [sourceId]);
    assert.equal(parseInt(remaining.rows[0].count, 10), 0);

    // Clean up source
    await pool.query('DELETE FROM sources WHERE id = $1', [sourceId]);
  });
});
