import { strict as assert } from 'assert';
import { getSessionSecret, signToken, verifyToken, SessionPayload } from '../src/lib/auth';

async function runTests() {
  console.log('=== Ballast Security S2: Session Secret Fail-Closed Test Suite ===\n');

  const origSecret = process.env.SESSION_SECRET;
  const origKey = process.env.BALLAST_ENCRYPTION_KEY;
  const origNodeEnv = process.env.NODE_ENV;

  const testPayload: SessionPayload = {
    userId: 'u1111111-0000-0000-0000-000000000001',
    workspaceId: 'w1111111-0000-0000-0000-000000000001',
    email: 'sec_test@example.com',
    role: 'owner',
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  try {
    // Test 1: Production mode with explicit SESSION_SECRET
    console.log('[Test 1] Production mode with explicit SESSION_SECRET...');
    process.env.SESSION_SECRET = 'super_secure_production_secret_key_9876543210';
    delete process.env.BALLAST_ENCRYPTION_KEY;
    (process.env as any).NODE_ENV = 'production';

    const secret = getSessionSecret();
    assert.equal(secret, 'super_secure_production_secret_key_9876543210');

    const token = signToken(testPayload);
    assert.ok(token.includes('.'), 'Token must contain signature component');

    const verified = verifyToken(token);
    assert.ok(verified, 'Token must be verified successfully');
    assert.equal(verified?.email, testPayload.email);
    console.log('  Passed: Token signing & verification succeed in production with valid secret.');

    // Test 2: Fail-closed in production when SESSION_SECRET is missing
    console.log('\n[Test 2] Fail-closed in production when SESSION_SECRET is missing...');
    delete process.env.SESSION_SECRET;
    delete process.env.BALLAST_ENCRYPTION_KEY;
    (process.env as any).NODE_ENV = 'production';

    let getSecretThrew = false;
    try {
      getSessionSecret();
    } catch (err: any) {
      if (err.message.includes('[SECURITY FATAL]')) {
        getSecretThrew = true;
      }
    }
    assert.equal(getSecretThrew, true, 'getSessionSecret must throw [SECURITY FATAL] in production');

    let signThrew = false;
    try {
      signToken(testPayload);
    } catch (err: any) {
      if (err.message.includes('[SECURITY FATAL]')) {
        signThrew = true;
      }
    }
    assert.equal(signThrew, true, 'signToken must throw [SECURITY FATAL] in production');

    console.log('  Passed: Missing secret throws [SECURITY FATAL] in production mode.');

    // Test 3: Safe development mode fallback
    console.log('\n[Test 3] Development mode fallback...');
    delete process.env.SESSION_SECRET;
    delete process.env.BALLAST_ENCRYPTION_KEY;
    (process.env as any).NODE_ENV = 'development';

    const devSecret = getSessionSecret();
    assert.equal(devSecret, 'ballast_super_secret_session_key_for_dev_32b');
    const devToken = signToken(testPayload);
    const devVerified = verifyToken(devToken);
    assert.equal(devVerified?.email, testPayload.email);
    console.log('  Passed: Development mode uses fallback session secret safely.');

    console.log('\n[PASS] All Security S2 session secret tests passed successfully!\n');
  } finally {
    process.env.SESSION_SECRET = origSecret;
    process.env.BALLAST_ENCRYPTION_KEY = origKey;
    (process.env as any).NODE_ENV = origNodeEnv;
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
