import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { getDatabaseSslConfig, query } from '../src/db/client';

async function runTests() {
  console.log('=== Ballast Security S3: Database SSL Certificate Verification Test Suite ===\n');

  const origOptOut = process.env.DB_SSL_REJECT_UNAUTHORIZED;
  const origCa = process.env.DATABASE_CA_CERT;
  const origRootCert = process.env.PGSSLROOTCERT;

  try {
    // Test 1: Strict TLS Certificate Verification Default
    console.log('[Test 1] Testing strict TLS verification default...');
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
    delete process.env.DATABASE_CA_CERT;
    delete process.env.PGSSLROOTCERT;

    const sslConfig = getDatabaseSslConfig();
    assert.deepEqual(sslConfig, { rejectUnauthorized: true }, 'SSL config must enforce rejectUnauthorized: true by default');
    console.log('  Passed: rejectUnauthorized: true enforced by default.');

    // Test 2: Explicit Opt-Out for Self-Signed Local Dev
    console.log('\n[Test 2] Testing explicit opt-out via DB_SSL_REJECT_UNAUTHORIZED=false...');
    process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
    const optOutConfig = getDatabaseSslConfig();
    assert.deepEqual(optOutConfig, { rejectUnauthorized: false }, 'Opt-out should set rejectUnauthorized: false');
    console.log('  Passed: Explicit opt-out honored for local dev/testing.');

    // Test 3: Custom CA Certificate Support
    console.log('\n[Test 3] Testing custom CA certificate support...');
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const dummyCert = '-----BEGIN CERTIFICATE-----\nMIIB...test...CA\n-----END CERTIFICATE-----';
    process.env.DATABASE_CA_CERT = dummyCert;
    const caConfig = getDatabaseSslConfig() as any;
    assert.equal(caConfig?.rejectUnauthorized, true);
    assert.equal(caConfig?.ca, dummyCert);

    // Test file path CA cert
    const tmpCertPath = path.resolve(process.cwd(), 'temp_dummy_ca.pem');
    fs.writeFileSync(tmpCertPath, dummyCert);
    process.env.DATABASE_CA_CERT = tmpCertPath;
    const caFileConfig = getDatabaseSslConfig() as any;
    assert.equal(caFileConfig?.rejectUnauthorized, true);
    assert.equal(caFileConfig?.ca, dummyCert);
    fs.unlinkSync(tmpCertPath);
    console.log('  Passed: Custom CA certificate string and file path support verified.');

    // Test 4: Live Query Execution with Active Client
    console.log('\n[Test 4] Live query execution with strict TLS pool...');
    delete process.env.DATABASE_CA_CERT;
    const rows = await query<{ now: string }>('SELECT NOW() as now');
    assert.ok(rows.length > 0, 'Database query should return results over verified TLS connection');
    assert.ok(rows[0].now, 'Result row must contain valid timestamp');
    console.log('  Passed: Live database query succeeded over verified TLS connection.');

    console.log('\n[PASS] All Security S3 database SSL verification tests passed successfully!\n');
  } finally {
    process.env.DB_SSL_REJECT_UNAUTHORIZED = origOptOut;
    process.env.DATABASE_CA_CERT = origCa;
    process.env.PGSSLROOTCERT = origRootCert;
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
