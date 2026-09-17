import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getSmartQuestionSuggestions } from '@/core/suggestions';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get('mode');
    const limitParam = searchParams.get('limit');

    const mode = modeParam === 'home' || modeParam === 'world' ? modeParam : 'all';
    const limit = limitParam ? parseInt(limitParam, 10) : 6;
    const safeLimit = isNaN(limit) || limit <= 0 ? 6 : Math.min(limit, 20);

    const suggestions = await getSmartQuestionSuggestions(payload.workspaceId, {
      mode,
      limit: safeLimit,
    });

    return NextResponse.json({
      suggestions,
      count: suggestions.length,
    });
  } catch (err: any) {
    console.error('[API /api/suggestions error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
