import { NextRequest } from 'next/server';
import { generateCsrfToken, validateCsrfToken, verifyCsrf, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../src/lib/csrf';
import { getSessionCookieOptions } from '../src/lib/auth';
import { POST as loginHandler } from '../src/app/api/auth/login/route';
import { POST as signupHandler } from '../src/app/api/auth/signup/route';
import { pool } from '../src/db/client';

async function runTest() {
  console.log('=== Ballast M1: CSRF & SameSite=Strict Protection Test Suite ===\n');

  try {
    console.log('[Test 1] Testing CSRF token generation and cryptographic HMAC validation...');
    const validToken = generateCsrfToken();
    console.log('  Generated CSRF Token:', validToken);
    if (!validateCsrfToken(validToken)) {
      throw new Error('Valid CSRF token failed validation.');
    }

    const tamperedToken = validToken.slice(0, -4) + 'abcd';
    if (validateCsrfToken(tamperedToken)) {
      throw new Error('Tampered CSRF token unexpectedly passed validation.');
    }

    if (validateCsrfToken(null) || validateCsrfToken('') || validateCsrfToken('invalid.payload.extra')) {
      throw new Error('Malformed CSRF tokens should fail validation.');
    }
    console.log('  Passed: CSRF token HMAC generation and tamper detection verified.');

    console.log('\n[Test 2] Testing verifyCsrf for Origin / Referer validation...');
    // Safe GET request
    const getReq = new NextRequest('http://localhost:3000/api/briefs', { method: 'GET' });
    const getResult = verifyCsrf(getReq);
    if (!getResult.valid) {
      throw new Error('Safe GET request was incorrectly blocked by CSRF.');
    }
    console.log('  Passed: Safe GET request allowed.');

    // Same-origin POST request
    const sameOriginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
    });
    const sameOriginResult = verifyCsrf(sameOriginReq);
    if (!sameOriginResult.valid) {
      throw new Error(`Same-origin request rejected: ${sameOriginResult.error}`);
    }
    console.log('  Passed: Same-origin POST request allowed.');

    // Cross-site malicious POST request (Origin: http://attacker.com)
    const evilOriginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'http://malicious-attacker.com',
        host: 'localhost:3000',
      },
    });
    const evilOriginResult = verifyCsrf(evilOriginReq);
    if (evilOriginResult.valid) {
      throw new Error('Cross-site POST request from attacker origin was not blocked!');
    }
    console.log('  Passed: Cross-site POST request rejected with:', evilOriginResult.error);

    // Cross-site malicious POST request via Referer
    const evilRefererReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        referer: 'http://malicious-attacker.com/exploit.html',
        host: 'localhost:3000',
      },
    });
    const evilRefererResult = verifyCsrf(evilRefererReq);
    if (evilRefererResult.valid) {
      throw new Error('Cross-site POST request from attacker referer was not blocked!');
    }
    console.log('  Passed: Cross-site Referer request rejected with:', evilRefererResult.error);

    console.log('\n[Test 3] Testing double-submit CSRF token validation...');
    const csrfToken = generateCsrfToken();
    const doubleSubmitReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        [CSRF_HEADER_NAME]: csrfToken,
        cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      },
    });
    const doubleSubmitResult = verifyCsrf(doubleSubmitReq);
    if (!doubleSubmitResult.valid) {
      throw new Error(`Double-submit token failed: ${doubleSubmitResult.error}`);
    }
    console.log('  Passed: Matching double-submit CSRF token validated.');

    // Token mismatch
    const mismatchReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        [CSRF_HEADER_NAME]: generateCsrfToken(),
        cookie: `${CSRF_COOKIE_NAME}=${generateCsrfToken()}`,
      },
    });
    const mismatchResult = verifyCsrf(mismatchReq);
    if (mismatchResult.valid) {
      throw new Error('Mismatched CSRF header and cookie tokens should be rejected.');
    }
    console.log('  Passed: Mismatched CSRF tokens rejected.');

    console.log('\n[Test 4] Verifying getSessionCookieOptions SameSite=Strict configuration...');
    const cookieOpts = getSessionCookieOptions();
    if (cookieOpts.sameSite !== 'strict') {
      throw new Error(`Expected cookie sameSite to be 'strict', got ${cookieOpts.sameSite}`);
    }
    if (!cookieOpts.httpOnly) {
      throw new Error('Expected cookie httpOnly to be true.');
    }
    console.log('  Passed: Session cookie options configured with SameSite=Strict and HttpOnly=true.');

    console.log('\n[Test 5] Testing auth route login & signup CSRF integration...');
    const maliciousLoginReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'http://evil-site.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });
    const evilLoginRes = await loginHandler(maliciousLoginReq);
    if (evilLoginRes.status !== 403) {
      throw new Error(`Expected login from evil origin to return 403 Forbidden, got ${evilLoginRes.status}`);
    }
    console.log('  Passed: Login route blocked cross-site request with 403.');

    const maliciousSignupReq = new NextRequest('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: {
        origin: 'http://evil-site.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'test_csrf@example.com', password: 'password123' }),
    });
    const evilSignupRes = await signupHandler(maliciousSignupReq);
    if (evilSignupRes.status !== 403) {
      throw new Error(`Expected signup from evil origin to return 403 Forbidden, got ${evilSignupRes.status}`);
    }
    console.log('  Passed: Signup route blocked cross-site request with 403.');

    console.log('\n[PASS] All M1 CSRF and SameSite=Strict protection tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] M1 test failed:', err);
  process.exit(1);
});
