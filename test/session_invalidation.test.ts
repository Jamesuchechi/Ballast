import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

import { query, pool } from '../src/db/client';
import {
  createUserWithWorkspace,
  authenticateUser,
  validateSessionToken,
  getAuthSession,
  invalidateUserSessions,
  signToken,
  COOKIE_NAME,
} from '../src/lib/auth';

async function runSessionInvalidationTests() {
  console.log('=== Ballast Session Invalidation Test Suite (Bug 6) ===\n');

  const testEmail = `test_session_${Date.now()}@example.com`;
  const initialPassword = 'InitialSecurePassword123!';
  let userId: string | null = null;
  let workspaceId: string | null = null;

  try {
    // 1. Create user and workspace
    console.log('[Test 1] Creating user with workspace...');
    const signup = await createUserWithWorkspace({
      email: testEmail,
      password: initialPassword,
      name: 'Session Test User',
      workspaceName: 'Session Test WS',
    });

    userId = signup.user.id;
    workspaceId = signup.workspace.id;

    assert.ok(signup.token, 'Signup returned a token');
    console.log(' -> User created:', userId);

    // 2. Validate token on fresh signup
    console.log('[Test 2] Validating token with validateSessionToken...');
    const validated1 = await validateSessionToken(signup.token);
    assert.ok(validated1, 'Token must validate successfully');
    assert.strictEqual(validated1.userId, userId);
    assert.strictEqual(validated1.sessionVersion, 1);

    // 3. Validate via getAuthSession mock
    console.log('[Test 3] Validating via getAuthSession mock request...');
    const mockReq = {
      cookies: {
        get: (name: string) => (name === COOKIE_NAME ? { value: signup.token } : undefined),
      },
    };
    const sessionFromCookie = await getAuthSession(mockReq);
    assert.ok(sessionFromCookie, 'getAuthSession must resolve session');
    assert.strictEqual(sessionFromCookie.userId, userId);
    assert.strictEqual(sessionFromCookie.sessionVersion, 1);

    // 4. Authenticate user to get another session token
    console.log('[Test 4] Authenticating user with password...');
    const login = await authenticateUser(testEmail, initialPassword);
    assert.ok(login, 'Authentication must succeed');
    const tokenBeforeInvalidation = login.token;
    const validatedBefore = await validateSessionToken(tokenBeforeInvalidation);
    assert.ok(validatedBefore, 'Login token must validate');

    // 5. Invalidate all sessions for user
    console.log('[Test 5] Invalidating user sessions...');
    const newVersion = await invalidateUserSessions(userId);
    assert.strictEqual(newVersion, 2, 'Session version should increment to 2');

    // 6. Verify previous tokens are now rejected
    console.log('[Test 6] Verifying previous tokens are rejected after invalidation...');
    const validatedAfter1 = await validateSessionToken(signup.token);
    assert.strictEqual(validatedAfter1, null, 'Original signup token must be rejected');

    const validatedAfter2 = await validateSessionToken(tokenBeforeInvalidation);
    assert.strictEqual(validatedAfter2, null, 'Pre-invalidation login token must be rejected');

    const cookieAfter = await getAuthSession(mockReq);
    assert.strictEqual(cookieAfter, null, 'getAuthSession must reject invalidated token');

    // 7. Authenticate again and verify new token has version 2 and validates
    console.log('[Test 7] Authenticating after invalidation...');
    const reLogin = await authenticateUser(testEmail, initialPassword);
    assert.ok(reLogin, 'Re-login must succeed');
    const newValidated = await validateSessionToken(reLogin.token);
    assert.ok(newValidated, 'New token must validate');
    assert.strictEqual(newValidated.sessionVersion, 2, 'New token must have sessionVersion = 2');

    const mockReqNew = {
      cookies: {
        get: (name: string) => (name === COOKIE_NAME ? { value: reLogin.token } : undefined),
      },
    };
    const sessionNew = await getAuthSession(mockReqNew);
    assert.ok(sessionNew, 'getAuthSession must resolve active session');
    assert.strictEqual(sessionNew.sessionVersion, 2);

    console.log('\n[PASS] All session invalidation tests passed successfully!');
  } finally {
    if (workspaceId && userId) {
      await query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [workspaceId]);
      await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
      await query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await pool.end();
  }
}

runSessionInvalidationTests().catch((err) => {
  console.error('[FAIL] Session invalidation test failed:', err);
  process.exit(1);
});
