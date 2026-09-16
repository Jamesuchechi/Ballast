import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { exportWorkspaceData } from '@/core/deletion';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owner can export full workspace (NFR2.3)
    if (payload.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Owner role required for workspace export' }, { status: 403 });
    }

    const data = await exportWorkspaceData(payload.workspaceId);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="ballast-workspace-export-${payload.workspaceId}-${Date.now()}.json"`,
      },
    });
  } catch (err: any) {
    console.error('[API /api/workspace/export error]:', err);
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}
