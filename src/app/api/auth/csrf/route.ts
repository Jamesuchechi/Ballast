import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken, attachCsrfCookie } from '@/lib/csrf';

export async function GET(req: NextRequest) {
  const token = generateCsrfToken();
  const res = NextResponse.json({ csrfToken: token });
  attachCsrfCookie(res, token);
  return res;
}
