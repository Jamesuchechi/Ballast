import { strict as assert } from 'assert';
import { NextRequest } from 'next/server';
import { getClientIp, checkRateLimit, checkCompoundRateLimit } from '../src/lib/rateLimit';

function makeMockRequest(headers: Record<string, string>): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/auth/login', {
    headers: new Headers(headers),
  });
  return req;
}

async function runTests() {
  console.log('=== Ballast Security S4: Client IP Extraction & Compound Rate Limiting Test Suite ===\n');

  // Test 1: Header Precedence (Cloudflare -> Vercel -> X-Real-IP -> X-Forwarded-For)
  console.log('[Test 1] Testing header precedence and trusted proxy resolution...');

  const cfReq = makeMockRequest({
    'cf-connecting-ip': '198.51.100.1',
    'x-forwarded-for': '203.0.113.1, 198.51.100.1',
  });
  assert.equal(getClientIp(cfReq), '198.51.100.1', 'cf-connecting-ip should take top precedence');

  const vercelReq = makeMockRequest({
    'x-vercel-forwarded-for': '198.51.100.2',
    'x-forwarded-for': '203.0.113.2',
  });
  assert.equal(getClientIp(vercelReq), '198.51.100.2', 'x-vercel-forwarded-for should take precedence over x-forwarded-for');

  const realIpReq = makeMockRequest({
    'x-real-ip': '198.51.100.3',
    'x-forwarded-for': '203.0.113.3',
  });
  assert.equal(getClientIp(realIpReq), '198.51.100.3', 'x-real-ip should take precedence over x-forwarded-for');

  const xffReq = makeMockRequest({
    'x-forwarded-for': '203.0.113.4, 10.0.0.1',
  });
  assert.equal(getClientIp(xffReq), '203.0.113.4', 'x-forwarded-for should parse first valid IP');
  console.log('  Passed: Reverse proxy header precedence correctly resolved.');

  // Test 2: Spoofed & Malformed Header Sanitation
  console.log('\n[Test 2] Testing malformed / spoofed IP sanitation...');

  const spoofedReq = makeMockRequest({
    'x-forwarded-for': '<script>alert(1)</script>, invalid_ip_address, 192.168.1.50',
  });
  assert.equal(getClientIp(spoofedReq), '192.168.1.50', 'Should ignore malicious strings and pick first valid IP');

  const allGarbageReq = makeMockRequest({
    'x-forwarded-for': 'not_an_ip, also_not_ip',
  });
  assert.equal(getClientIp(allGarbageReq), '127.0.0.1', 'Should fallback to 127.0.0.1 when no valid IP exists');

  const ipv6Req = makeMockRequest({
    'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  });
  assert.equal(getClientIp(ipv6Req), '2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'IPv6 addresses must be recognized');
  console.log('  Passed: Malformed headers safely sanitized with net.isIP.');

  // Test 3: Compound Rate Limiting (Multi-key checks)
  console.log('\n[Test 3] Testing compound rate limiting across IP and Account keys...');

  const testKeyIp = `test:sec4:ip:${Date.now()}`;
  const testKeyEmail = `test:sec4:email:${Date.now()}`;

  // First 3 attempts should pass
  for (let i = 0; i < 3; i++) {
    const res = await checkCompoundRateLimit([
      { key: testKeyIp, limit: 5, windowSeconds: 60 },
      { key: testKeyEmail, limit: 3, windowSeconds: 60 },
    ]);
    assert.equal(res.success, true, `Attempt ${i + 1} should succeed`);
  }

  // 4th attempt should fail because email limit (3) is exceeded even though IP limit (5) has quota left
  const blockedRes = await checkCompoundRateLimit([
    { key: testKeyIp, limit: 5, windowSeconds: 60 },
    { key: testKeyEmail, limit: 3, windowSeconds: 60 },
  ]);
  assert.equal(blockedRes.success, false, 'Compound check must fail when target account limit is exceeded');
  console.log('  Passed: Compound rate limiting enforces target account protection across rotating IPs.');

  console.log('\n[PASS] All Security S4 rate limit & IP sanitization tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
