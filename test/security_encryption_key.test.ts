import { strict as assert } from 'assert';
import { getEncryptionKey as getTokenKey, encryptString, decryptString } from '../src/connectors/tokenStore';
import { getEncryptionKey as getStoreKey, objectStore } from '../src/storage/objectStore';

async function runTests() {
  console.log('=== Ballast Security S1: Encryption Key Fail-Closed Test Suite ===\n');

  const origKey = process.env.BALLAST_ENCRYPTION_KEY;
  const origSecret = process.env.SESSION_SECRET;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    // Test 1: Explicit key derivation
    console.log('[Test 1] Explicit key derivation with custom BALLAST_ENCRYPTION_KEY...');
    process.env.BALLAST_ENCRYPTION_KEY = 'custom_production_secret_encryption_key_12345';
    delete process.env.SESSION_SECRET;
    (process.env as any).NODE_ENV = 'production';

    const tokenKey = getTokenKey();
    const storeKey = getStoreKey();
    assert.equal(tokenKey.length, 32, 'Derived key must be 32 bytes (256-bit)');
    assert.deepEqual(tokenKey, storeKey, 'TokenStore and ObjectStore must use the same derived key');

    // Test encryption / decryption in production
    const testPlaintext = 'super_secret_connector_oauth_token';
    const encrypted = encryptString(testPlaintext);
    assert.ok(!encrypted.includes(testPlaintext), 'Ciphertext must not contain plaintext');
    const decrypted = decryptString(encrypted);
    assert.equal(decrypted, testPlaintext, 'Decrypted text must match plaintext');

    const fileKey = 'sec_test/doc.txt';
    await objectStore.put(fileKey, 'confidential document payload');
    const fileBytes = await objectStore.get(fileKey);
    assert.equal(fileBytes?.toString('utf8'), 'confidential document payload');
    await objectStore.delete(fileKey);
    console.log('  Passed: Encryption/decryption verified in production with valid key.');

    // Test 2: Fail-closed in production when no encryption key is set
    console.log('\n[Test 2] Testing fail-closed behavior in production when keys are missing...');
    delete process.env.BALLAST_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
    (process.env as any).NODE_ENV = 'production';

    let tokenThrew = false;
    try {
      getTokenKey();
    } catch (err: any) {
      if (err.message.includes('[SECURITY FATAL]')) {
        tokenThrew = true;
      }
    }
    assert.equal(tokenThrew, true, 'tokenStore.getEncryptionKey must throw in production if key is missing');

    let storeThrew = false;
    try {
      getStoreKey();
    } catch (err: any) {
      if (err.message.includes('[SECURITY FATAL]')) {
        storeThrew = true;
      }
    }
    assert.equal(storeThrew, true, 'objectStore.getEncryptionKey must throw in production if key is missing');

    let encryptThrew = false;
    try {
      encryptString('fail_test');
    } catch (err: any) {
      if (err.message.includes('[SECURITY FATAL]')) {
        encryptThrew = true;
      }
    }
    assert.equal(encryptThrew, true, 'encryptString must throw in production if key is missing');

    console.log('  Passed: Missing key throws [SECURITY FATAL] in production mode.');

    // Test 3: Dev mode fallback
    console.log('\n[Test 3] Testing development mode fallback...');
    delete process.env.BALLAST_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
    (process.env as any).NODE_ENV = 'development';

    const devKey = getTokenKey();
    assert.equal(devKey.length, 32);
    const devEnc = encryptString('dev_token');
    const devDec = decryptString(devEnc);
    assert.equal(devDec, 'dev_token');
    console.log('  Passed: Development mode uses fallback key safely.');

    console.log('\n[PASS] All Security S1 encryption key tests passed successfully!\n');
  } finally {
    process.env.BALLAST_ENCRYPTION_KEY = origKey;
    process.env.SESSION_SECRET = origSecret;
    (process.env as any).NODE_ENV = origNodeEnv;
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
