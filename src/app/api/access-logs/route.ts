import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    let workspaceId: string | null = payload?.workspaceId || null;

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ logs: [] });
      }
      workspaceId = defaultWs.id;
    }

    const logs = await query(
      `SELECT 
         a.id,
         a.action,
         a.created_at,
         COALESCE(s.connector, 'system') as connector,
         COALESCE(s.external_id, 'workspace') as source_name,
         b.question as brief_question,
         w.name as workspace_name
       FROM access_logs a
       LEFT JOIN sources s ON s.id = a.source_id
       LEFT JOIN briefs b ON b.id = a.brief_id
       LEFT JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.workspace_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [workspaceId]
    );

    return NextResponse.json({ logs });
  } catch (err: any) {
    console.error('List access logs error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
