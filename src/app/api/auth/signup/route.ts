import { NextRequest, NextResponse } from 'next/server';
import { createUserWithWorkspace, COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth';
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
    const { email, password, name, workspaceName } = body;

    const rateLimitsToCheck = [
      {
        key: `auth:signup:ip:${clientIp}`,
        limit: 10,
        windowSeconds: 60,
      },
    ];

    if (email && typeof email === 'string') {
      const normalizedEmail = email.trim().toLowerCase();
      rateLimitsToCheck.push({
        key: `auth:signup:email:${normalizedEmail}`,
        limit: 5,
        windowSeconds: 60,
      });
    }

    const rateLimit = await checkCompoundRateLimit(rateLimitsToCheck);
    if (!rateLimit.success) {
      return rateLimitResponse(
        rateLimit,
        'Too many account creation attempts. Please wait 60 seconds before trying again.'
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const { user, workspace, token } = await createUserWithWorkspace({
      email,
      password,
      name,
      workspaceName,
    });

    const response = NextResponse.json({
      user,
      workspace,
      message: 'Account and workspace created successfully',
    });

    // Set secure HTTP-only SameSite=Strict session cookie
    response.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
    attachCsrfCookie(response);

    return response;
  } catch (err: any) {
    if (err.message && err.message.includes('unique constraint') && err.message.includes('users_email_key')) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }
    console.error('Signup error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create account' },
      { status: 500 }
    );
  }
}
