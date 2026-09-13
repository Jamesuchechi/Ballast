import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'ballast_session';

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', request.nextUrl.pathname);

  if (!token) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return NextResponse.redirect(loginUrl);
    }

    const [data, sig] = parts;
    if (!data || !sig) {
      return NextResponse.redirect(loginUrl);
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.userId || !payload.workspaceId) {
      return NextResponse.redirect(loginUrl);
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/app', '/app/:path*'],
};
