import { NextRequest, NextResponse } from 'next/server';
import { createUserWithWorkspace, COOKIE_NAME } from '@/lib/auth';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit({
      key: `auth:signup:${clientIp}`,
      limit: 5,
      windowSeconds: 60,
    });

    if (!rateLimit.success) {
      return rateLimitResponse(
        rateLimit,
        'Too many account creation attempts. Please wait 60 seconds before trying again.'
      );
    }

    const body = await req.json();
    const { email, password, name, workspaceName } = body;

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

    // Set secure HTTP-only session cookie
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

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
