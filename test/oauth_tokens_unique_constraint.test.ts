import { pool } from '../src/db/client';
import { storeEncryptedToken, getDecryptedToken, revokeToken, getTokenStatus } from '../src/connectors/tokenStore';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  console.log('=== Ballast D6: OAuth Tokens Unique Constraint Test Suite ===\n');

  try {
    console.log('[Test 1] Applying migration 010_add_unique_constraint_to_oauth_tokens.sql...');
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/db/migrations/010_add_unique_constraint_to_oauth_tokens.sql'),
      'utf8'
    );
    await pool.query(migrationSql);
    console.log('  Passed: Migration executed successfully.');

    console.log('\n[Test 2] Verifying partial unique index in PostgreSQL catalog...');
    const indexRes = await pool.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'oauth_tokens' AND indexname = 'idx_oauth_tokens_workspace_connector_active';
    `);

    if (indexRes.rowCount === 0) {
      throw new Error('Index idx_oauth_tokens_workspace_connector_active not found in pg_indexes.');
    }
    console.log('  Passed: Discovered partial unique index:', indexRes.rows[0].indexdef);

    console.log('\n[Test 3] Creating test workspace and simulating concurrent token store calls...');
    const dummyWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name)
      VALUES ('D6 Test Workspace')
      RETURNING id;
    `);
    const workspaceId = dummyWorkspace.rows[0].id;

    // Simulate 5 concurrent storeEncryptedToken calls for the same workspace + connector
    const results = await Promise.all([
      storeEncryptedToken(workspaceId, 'github', { token: 'token_val_1', user: 'u1' }, ['repo']),
      storeEncryptedToken(workspaceId, 'github', { token: 'token_val_2', user: 'u2' }, ['repo', 'user']),
      storeEncryptedToken(workspaceId, 'github', { token: 'token_val_3', user: 'u3' }, ['repo']),
      storeEncryptedToken(workspaceId, 'github', { token: 'token_val_4', user: 'u4' }, ['repo', 'admin']),
      storeEncryptedToken(workspaceId, 'github', { token: 'token_final', user: 'final_u' }, ['repo', 'read:org']),
    ]);

    console.log('  Concurrent store IDs:', results);

    const activeTokens = await pool.query<{ id: string; connector: string }>(
      `SELECT id, connector FROM oauth_tokens
       WHERE workspace_id = $1 AND connector = 'github' AND revoked_at IS NULL;`,
      [workspaceId]
    );

    if (activeTokens.rowCount !== 1) {
      throw new Error(`Expected exactly 1 active token row, but found ${activeTokens.rowCount}`);
    }
    console.log('  Passed: Exactly 1 active row exists after concurrent upserts.');

    console.log('\n[Test 4] Testing token decryption and status...');
    const decrypted = await getDecryptedToken<{ token: string; user: string }>(workspaceId, 'github');
    if (!decrypted || !decrypted.token) {
      throw new Error('Decryption of stored token failed.');
    }
    console.log('  Passed: Decrypted active token:', decrypted);

    const statusBeforeRevoke = await getTokenStatus(workspaceId, 'github');
    if (!statusBeforeRevoke.connected || statusBeforeRevoke.revoked) {
      throw new Error('Expected token status to be connected.');
    }
    console.log('  Passed: Token status is connected.');

    console.log('\n[Test 5] Testing token revocation and subsequent fresh token insertion...');
    const revoked = await revokeToken(workspaceId, 'github');
    if (!revoked) {
      throw new Error('revokeToken failed.');
    }

    const statusAfterRevoke = await getTokenStatus(workspaceId, 'github');
    if (statusAfterRevoke.connected || !statusAfterRevoke.revoked) {
      throw new Error('Expected token status to be revoked.');
    }
    console.log('  Passed: Token status reflects revoked.');

    // Store a new active token after revocation
    const newActiveId = await storeEncryptedToken(
      workspaceId,
      'github',
      { token: 'new_token_fresh', user: 'fresh_u' },
      ['repo']
    );
    console.log('  Stored new active token with ID:', newActiveId);

    const allRows = await pool.query<{ id: string; revoked_at: string | null }>(
      `SELECT id, revoked_at FROM oauth_tokens
       WHERE workspace_id = $1 AND connector = 'github'
       ORDER BY created_at ASC;`,
      [workspaceId]
    );

    if (allRows.rowCount !== 2) {
      throw new Error(`Expected 2 historical token rows (1 revoked, 1 active), found ${allRows.rowCount}`);
    }
    const revokedRow = allRows.rows.find((r) => r.revoked_at !== null);
    const activeRow = allRows.rows.find((r) => r.revoked_at === null);
    if (!revokedRow || !activeRow) {
      throw new Error('Expected 1 revoked row and 1 active row.');
    }
    console.log('  Passed: 1 revoked historical row and 1 new active row coexist without conflict.');

    // Cleanup workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All D6 oauth_tokens unique constraint tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] D6 test failed:', err);
  process.exit(1);
});
