import { strict as assert } from 'assert';
import { secretsManager } from '../src/core/secretsManager';
import { query, queryOne } from '../src/db/client';

async function runTests() {
  console.log('=== Ballast Token Rotation & Revocation Test Suite (Bug 11) ===\n');

  const wsId = 'c1100000-0000-0000-0000-000000000001';

  // Setup workspace
  await query(
    `INSERT INTO workspaces (id, name)
     VALUES ($1, 'Token Rotation WS')
     ON CONFLICT (id) DO NOTHING`,
    [wsId]
  );

  // Clean up any existing tokens for test
  await query(`DELETE FROM oauth_tokens WHERE workspace_id = $1`, [wsId]);
  await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [wsId]);

  console.log('[Test 1] Setting initial token...');
  const initialTokenData = { access_token: 'ya29.initial_token_abc', refresh_token: '1//initial_refresh_123' };
  const initialTokenId = await secretsManager.setToken(wsId, 'gmail', initialTokenData, ['https://mail.google.com/']);
  assert.ok(initialTokenId, 'Initial token ID must be returned');

  // Verify initial token row in DB
  const initialRow = await queryOne<{ id: string; revoked_at: string | null; scopes: any }>(
    `SELECT id, revoked_at, scopes FROM oauth_tokens WHERE id = $1`,
    [initialTokenId]
  );
  assert.ok(initialRow, 'Initial DB row must exist');
  assert.equal(initialRow.revoked_at, null, 'Initial token must not be revoked');

  console.log('[Test 2] Rotating token to new credentials...');
  const rotatedTokenData = { access_token: 'ya29.rotated_token_xyz', refresh_token: '1//rotated_refresh_789' };
  const rotatedTokenId = await secretsManager.rotateToken(wsId, 'gmail', rotatedTokenData);
  assert.ok(rotatedTokenId, 'Rotated token ID must be returned');
  assert.notEqual(rotatedTokenId, initialTokenId, 'Rotated token must be a new record leaving old token historically revoked');

  // Verify old token is revoked
  const oldRowAfterRotate = await queryOne<{ id: string; revoked_at: string | null }>(
    `SELECT id, revoked_at FROM oauth_tokens WHERE id = $1`,
    [initialTokenId]
  );
  assert.ok(oldRowAfterRotate?.revoked_at !== null, 'Previous token row must be marked revoked');

  // Verify new token is active
  const newRowAfterRotate = await queryOne<{ id: string; revoked_at: string | null; scopes: any }>(
    `SELECT id, revoked_at, scopes FROM oauth_tokens WHERE id = $1`,
    [rotatedTokenId]
  );
  assert.equal(newRowAfterRotate?.revoked_at, null, 'New rotated token must be active');
  assert.deepEqual(newRowAfterRotate?.scopes, ['https://mail.google.com/'], 'Scopes should be preserved across rotation');

  // Verify active token retrieval
  const activeToken = await secretsManager.getToken<any>(wsId, 'gmail');
  assert.equal(activeToken?.access_token, 'ya29.rotated_token_xyz', 'Decrypted active token must match rotated credentials');

  // Verify audit logs
  const logs = await query<{ action: string }>(
    `SELECT action FROM access_logs WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [wsId]
  );
  const actions = logs.map(l => l.action);
  assert.ok(actions.includes('token_stored:gmail'), 'Audit logs must contain token_stored:gmail');
  assert.ok(actions.includes('token_rotated:gmail'), 'Audit logs must contain token_rotated:gmail');

  console.log('[Test 3] Revoking active rotated token...');
  const revoked = await secretsManager.revoke(wsId, 'gmail');
  assert.equal(revoked, true);

  const tokenAfterRevoke = await secretsManager.getToken(wsId, 'gmail');
  assert.equal(tokenAfterRevoke, null, 'Revoked token cannot be retrieved');

  // Clean up
  await query(`DELETE FROM oauth_tokens WHERE workspace_id = $1`, [wsId]);
  await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [wsId]);
  await query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);

  console.log('\n[PASS] All token rotation & revocation tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
