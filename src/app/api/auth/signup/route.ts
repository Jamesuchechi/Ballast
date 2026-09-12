import { NextRequest, NextResponse } from 'next/server';
import { createUserWithWorkspace, COOKIE_NAME } from '@/lib/auth';
import { seedCanonicalBrief } from '@/core/briefSeed';

export async function POST(req: NextRequest) {
  try {
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

    // Seed canonical brief into the new workspace so the user starts with immediate value
    try {
      await seedCanonicalBrief(workspace.id);
    } catch (seedErr) {
      console.warn('Initial brief seed warning:', seedErr);
    }

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
