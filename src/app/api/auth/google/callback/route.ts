import { NextRequest, NextResponse } from 'next/server';
import { findOrCreateGoogleUser, COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth';
import { getGoogleAuthRedirectUri } from '@/lib/url';
import { attachCsrfCookie } from '@/lib/csrf';

export async function GET(req: NextRequest) {
  const loginUrl = new URL('/login', req.url);

  try {
    const error = req.nextUrl.searchParams.get('error');
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');

    // 1. Handle error from Google
    if (error) {
      loginUrl.searchParams.set('error', 'google_auth_denied');
      loginUrl.searchParams.set('message', `Google sign-in was cancelled or denied: ${error}`);
      return NextResponse.redirect(loginUrl);
    }

    if (!code) {
      loginUrl.searchParams.set('error', 'missing_code');
      loginUrl.searchParams.set('message', 'Authorization code was not provided by Google.');
      return NextResponse.redirect(loginUrl);
    }

    // 2. Decode and validate state parameter
    let targetPath = '/app';
    if (state) {
      try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (decodedState?.from && typeof decodedState.from === 'string' && decodedState.from.startsWith('/')) {
          targetPath = decodedState.from;
        }
      } catch {
        // Fall back to /app if state JSON is invalid
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getGoogleAuthRedirectUri(req);

    if (!clientId || !clientSecret) {
      loginUrl.searchParams.set('error', 'google_not_configured');
      loginUrl.searchParams.set('message', 'Google OAuth credentials missing on server.');
      return NextResponse.redirect(loginUrl);
    }

    // 3. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Google token exchange error:', tokenData);
      loginUrl.searchParams.set('error', 'token_exchange_failed');
      loginUrl.searchParams.set(
        'message',
        tokenData.error_description || tokenData.error || 'Failed to exchange token with Google.'
      );
      return NextResponse.redirect(loginUrl);
    }

    // 4. Fetch user profile from Google UserInfo endpoint
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      console.error('Google userinfo fetch error:', profile);
      loginUrl.searchParams.set('error', 'userinfo_failed');
      loginUrl.searchParams.set('message', 'Failed to retrieve user profile from Google.');
      return NextResponse.redirect(loginUrl);
    }

    // 5. Find or create user and initial workspace in database
    const { user, workspace, token } = await findOrCreateGoogleUser({
      email: profile.email,
      name: profile.name || profile.given_name || undefined,
      googleId: profile.sub,
    });

    // 6. Set HTTP-only session cookie and redirect to target app path
    const destinationUrl = new URL(targetPath, req.url);
    const response = NextResponse.redirect(destinationUrl);

    response.cookies.set(COOKIE_NAME, token, getSessionCookieOptions());
    attachCsrfCookie(response);

    // Clear temporary OAuth state cookie
    response.cookies.delete('google_oauth_state');

    return response;
  } catch (err: any) {
    console.error('Google callback unexpected error:', err);
    loginUrl.searchParams.set('error', 'callback_error');
    loginUrl.searchParams.set('message', err.message || 'Authentication failed unexpectedly.');
    return NextResponse.redirect(loginUrl);
  }
}
