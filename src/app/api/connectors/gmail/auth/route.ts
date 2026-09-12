import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { storeEncryptedToken } from '@/connectors/tokenStore';

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('ballast_session');
    let workspaceId: string | null = null;

    if (sessionCookie?.value) {
      const member = await queryOne<{ workspace_id: string }>(
        `SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`,
        [sessionCookie.value]
      );
      if (member) workspaceId = member.workspace_id;
    }

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (defaultWs) workspaceId = defaultWs.id;
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.nextUrl.origin}/api/connectors/gmail/callback`;
    const isMock = req.nextUrl.searchParams.get('mock') === 'true' || !clientId;

    if (isMock) {
      // Connect mock token for offline development & tests
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
