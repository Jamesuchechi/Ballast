import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth';
import { checkCompoundRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';
import { verifyCsrf, attachCsrfCookie } from '@/lib/csrf';

export async function POST(req: NextRequest) {
  try {
    // 1. CSRF Protection (M1)
    const csrfCheck = verifyCsrf(req);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { error: csrfCheck.error || 'CSRF validation failed' },
        { status: 403 }
      );
    }

    const clientIp = getClientIp(req);
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    const rateLimitsToCheck = [
      {
        key: `auth:login:ip:${clientIp}`,
        limit: 10,
        windowSeconds: 60,
      },
    ];

    if (email && typeof email === 'string') {
      const normalizedEmail = email.trim().toLowerCase();
      rateLimitsToCheck.push({
        key: `auth:login:email:${normalizedEmail}`,
        limit: 5,
        windowSeconds: 60,
      });
    }

    const rateLimit = await checkCompoundRateLimit(rateLimitsToCheck);
    if (!rateLimit.success) {
      return rateLimitResponse(
        rateLimit,
        'Too many login attempts. Please wait 60 seconds before trying again.'
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const authResult = await authenticateUser(email, password);

    if (!authResult) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      user: authResult.user,
      workspace: authResult.workspace,
    });

    // Set secure, SameSite=Strict HTTP-only session cookie
    response.cookies.set(COOKIE_NAME, authResult.token, getSessionCookieOptions());
    attachCsrfCookie(response);

    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: err.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}
