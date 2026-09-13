import { NextRequest, NextResponse } from 'next/server';
import { storeEncryptedToken } from '@/connectors/tokenStore';
import { getGmailRedirectUri } from '@/lib/url';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state'); // workspaceId
    const error = req.nextUrl.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/app?section=sources&error=${encodeURIComponent(error)}`, req.url));
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing OAuth authorization code or workspace state' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getGmailRedirectUri(req);

    if (!clientId || !clientSecret) {
      // Fallback mock token exchange
      await storeEncryptedToken(
        state,
        'gmail',
        { access_token: `mock_code_token_${Date.now()}` },
        ['https://www.googleapis.com/auth/gmail.readonly']
      );
      return NextResponse.redirect(new URL('/app?section=sources&connected=gmail', req.url));
    }

    // Exchange authorization code for tokens
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
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || 'Failed to exchange token with Google OAuth');
    }

    // Encrypt at rest in PostgreSQL oauth_tokens table (NFR1.2)
    await storeEncryptedToken(
      state,
      'gmail',
      tokenData,
      ['https://www.googleapis.com/auth/gmail.readonly']
    );

    return NextResponse.redirect(new URL('/app?section=sources&connected=gmail', req.url));
  } catch (err: any) {
    console.error('Gmail OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(`/app?section=sources&error=${encodeURIComponent(err.message || 'OAuth failed')}`, req.url)
    );
  }
}
