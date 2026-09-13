import { NextRequest, NextResponse } from 'next/server';
import { storeEncryptedToken } from '@/connectors/tokenStore';
import { getAuthSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.nextUrl.origin}/api/connectors/gmail/callback`;
    const wantsMock = req.nextUrl.searchParams.get('mock') === 'true';
    const isMockPermitted = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    // Mock connection is ONLY allowed behind explicit ?mock=true AND EVAL_USE_MOCK=true/test
    if (wantsMock && isMockPermitted) {
      const mockToken = {
        access_token: `mock_gmail_access_${Date.now()}`,
        refresh_token: `mock_gmail_refresh_${Date.now()}`,
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600 * 1000,
      };

      await storeEncryptedToken(
        workspaceId,
        'gmail',
        mockToken,
        ['https://www.googleapis.com/auth/gmail.readonly']
      );

      return NextResponse.redirect(new URL('/app?section=sources&connected=gmail', req.url));
    }

    // Fail loudly if Google OAuth is unconfigured — NO silent mock fallback
    if (!clientId) {
      const isApiRequest = req.headers.get('accept')?.includes('application/json');
      const errorMessage = 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env';
      
      if (isApiRequest) {
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      const redirectErrorUrl = new URL('/app', req.url);
      redirectErrorUrl.searchParams.set('section', 'sources');
      redirectErrorUrl.searchParams.set('error', 'gmail_not_configured');
      redirectErrorUrl.searchParams.set('message', errorMessage);
      return NextResponse.redirect(redirectErrorUrl);
    }

    // Google OAuth 2.0 URL (minimum-necessary read-only scopes per NFR1.4)
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', workspaceId);

    return NextResponse.redirect(authUrl.toString());
  } catch (err: any) {
    console.error('Gmail auth initialization error:', err);
    return NextResponse.json({ error: err.message || 'OAuth init failed' }, { status: 500 });
  }
}
