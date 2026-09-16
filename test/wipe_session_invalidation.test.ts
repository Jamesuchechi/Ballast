import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

import { query, queryOne, pool } from '../src/db/client';
import { objectStore } from '../src/storage/objectStore';
import { wipeWorkspaceAccount } from '../src/core/deletion';
import {
  createUserWithWorkspace,
  validateSessionToken,
  getAuthSession,
  COOKIE_NAME,
} from '../src/lib/auth';

async function runWipeSessionTests() {
  console.log('=== Ballast Wipe Account Session Invalidation Test Suite (Bug 7) ===\n');

  const testEmail = `wipe_test_${Date.now()}@example.com`;
  const testPassword = 'SecurePasswordWipe123!';

  try {
    // 1. Create user and workspace
    console.log('[Test 1] Creating user and workspace...');
    const signup = await createUserWithWorkspace({
      email: testEmail,
      password: testPassword,
      name: 'Wipe Target User',
      workspaceName: 'Wipe Target Workspace',
    });

    const { user, workspace, token } = signup;
    assert.ok(token, 'Token generated');
    console.log(` -> User: ${user.id}, Workspace: ${workspace.id}`);

    // 2. Validate token is active
    console.log('[Test 2] Validating active session before wipe...');
    const sessionBefore = await validateSessionToken(token);
    assert.ok(sessionBefore, 'Session must be valid before wipe');
    assert.strictEqual(sessionBefore.userId, user.id);
    assert.strictEqual(sessionBefore.workspaceId, workspace.id);

    const mockReq = {
      cookies: {
        get: (name: string) => (name === COOKIE_NAME ? { value: token } : undefined),
      },
    };
    const authSessionBefore = await getAuthSession(mockReq);
    assert.ok(authSessionBefore, 'getAuthSession must resolve active session');

    // 3. Create sample workspace artifact in storage and DB
    console.log('[Test 3] Storing workspace artifacts and data rows...');
    const sampleFilePath = `${workspace.id}/test_artifact.txt`;
    await objectStore.put(sampleFilePath, 'Sensitive enterprise brief data');
    assert.equal(await objectStore.exists(sampleFilePath), true, 'Artifact stored');

    await query(
      `INSERT INTO briefs (id, workspace_id, question, mode, status, markdown)
       VALUES ($1, $2, 'Wipe question?', 'home', 'published', '# Secret Brief')`,
      [randomUUID(), workspace.id]
    );

    // 4. Perform workspace account wipe
    console.log('[Test 4] Executing wipeWorkspaceAccount...');
    const wipeResult = await wipeWorkspaceAccount(workspace.id);
    assert.equal(wipeResult.success, true, 'Wipe must report success');

    // 5. Verify database records are deleted
    console.log('[Test 5] Verifying database and disk artifacts purged...');
    const wsCheck = await queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM workspaces WHERE id = $1`, [workspace.id]);
    assert.equal(wsCheck?.count, '0', 'Workspace row must be deleted');

    const memberCheck = await queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM workspace_members WHERE workspace_id = $1`, [workspace.id]);
    assert.equal(memberCheck?.count, '0', 'Workspace members must be deleted');

    const briefCheck = await queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM briefs WHERE workspace_id = $1`, [workspace.id]);
    assert.equal(briefCheck?.count, '0', 'Briefs must be deleted');

    const fileCheck = await objectStore.exists(sampleFilePath);
    assert.equal(fileCheck, false, 'Storage file must be deleted');

    // 6. Verify open session token is immediately invalidated
    console.log('[Test 6] Verifying open session is immediately invalidated...');
    const sessionAfter = await validateSessionToken(token);
    assert.strictEqual(sessionAfter, null, 'Session token must be rejected after account wipe');

    const authSessionAfter = await getAuthSession(mockReq);
    assert.strictEqual(authSessionAfter, null, 'getAuthSession must return null for wiped workspace token');

    console.log('\n[PASS] All wipe session invalidation tests passed cleanly!');
  } finally {
    await pool.end();
  }
}

runWipeSessionTests().catch((err) => {
  console.error('[FAIL] Wipe session test failed:', err);
  process.exit(1);
});
