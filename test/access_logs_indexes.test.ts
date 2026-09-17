import { pool } from '../src/db/client';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  console.log('=== Ballast D5: Access Logs Indexes Test Suite ===\n');

  try {
    console.log('[Test 1] Applying migration 009_add_idx_access_logs.sql...');
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/db/migrations/009_add_idx_access_logs.sql'),
      'utf8'
    );
    await pool.query(migrationSql);
    console.log('  Passed: Migration executed successfully.');

    console.log('\n[Test 2] Verifying indexes on access_logs table in pg_indexes...');
    const indexesRes = await pool.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'access_logs';
    `);

    const indexNames = indexesRes.rows.map((r) => r.indexname);
    console.log('  Discovered indexes on access_logs:', indexNames);

    const requiredIndexes = [
      'idx_access_logs_action',
      'idx_access_logs_source',
      'idx_access_logs_workspace',
    ];

    for (const required of requiredIndexes) {
      if (!indexNames.includes(required)) {
        throw new Error(`Expected index "${required}" not found in access_logs table.`);
      }
      const def = indexesRes.rows.find((r) => r.indexname === required)?.indexdef;
      console.log(`  ✓ Index "${required}" found: ${def}`);
    }

    console.log('\n[Test 3] Testing retention query & action filter performance on access_logs...');
    const dummyWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name)
      VALUES ('D5 Test Workspace')
      RETURNING id;
    `);
    const workspaceId = dummyWorkspace.rows[0].id;

    await pool.query(
      `INSERT INTO access_logs (workspace_id, action) VALUES ($1, 'retention_global_pass:test_pass')`,
      [workspaceId]
    );

    const queryRes = await pool.query(
      `SELECT created_at FROM access_logs WHERE action LIKE 'retention_global_pass:%' ORDER BY created_at DESC LIMIT 1`
    );

    if (queryRes.rowCount === 0) {
      throw new Error('Expected query to return at least 1 record from access_logs.');
    }
    console.log(`  Passed: Query returned record with timestamp ${queryRes.rows[0].created_at}`);

    // Cleanup test workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All D5 access_logs indexes verified successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] D5 test failed:', err);
  process.exit(1);
});
