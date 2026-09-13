import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { findOrCreateGoogleUser, COOKIE_NAME } from '@/lib/auth';

import { getGoogleAuthRedirectUri } from '@/lib/url';

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get('from') || '/app';
    const wantsMock = req.nextUrl.searchParams.get('mock') === 'true';
    const isMockPermitted = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    // Mock bypass for evaluation / tests
    if (wantsMock && isMockPermitted) {
      const { token } = await findOrCreateGoogleUser({
        email: 'google.eval@ballast.local',
        name: 'Google Eval User',
        googleId: 'mock_google_sub_123',
      });

      const response = NextResponse.redirect(new URL(from, req.url));
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
      return response;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'google_not_configured');
      loginUrl.searchParams.set(
        'message',
        'Google OAuth is not configured. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.'
      );
      return NextResponse.redirect(loginUrl);
    }

    // Determine redirect URI dynamically for localhost or Vercel
    const redirectUri = getGoogleAuthRedirectUri(req);

    // Secure random state containing target redirect path and nonce
    const statePayload = {
      from: from.startsWith('/') ? from : '/app',
      nonce: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    const scopes = ['openid', 'email', 'profile'];
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('state', state);

    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (err: any) {
    console.error('Google auth init error:', err);
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', 'oauth_init_failed');
    loginUrl.searchParams.set('message', err.message || 'Failed to initialize Google authentication');
    return NextResponse.redirect(loginUrl);
  }
}
