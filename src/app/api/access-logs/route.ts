import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

/**
 * Access logs query endpoint (NFR2.4, NFR6.4).
 * Strictly gated to workspace owners. Supports rich filtering by connector,
 * action type, date range, and pagination.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // NFR6.4: Strictly queryable by workspace owner
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Forbidden: Only workspace owners can query access audit logs' },
        { status: 403 }
      );
    }

    const workspaceId = payload.workspaceId;
    const url = new URL(req.url);

    const connectorFilter = url.searchParams.get('connector');
    const actionFilter = url.searchParams.get('action');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    const conditions: string[] = ['a.workspace_id = $1'];
    const params: any[] = [workspaceId];
    let paramIndex = 2;

    if (connectorFilter) {
      conditions.push(`s.connector = $${paramIndex}`);
      params.push(connectorFilter);
      paramIndex++;
    }

    if (actionFilter) {
      conditions.push(`a.action ILIKE $${paramIndex}`);
      params.push(`%${actionFilter}%`);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`a.created_at >= $${paramIndex}`);
      params.push(new Date(startDate).toISOString());
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`a.created_at <= $${paramIndex}`);
      params.push(new Date(endDate).toISOString());
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Total count for pagination
    const countQuery = `
      SELECT COUNT(a.id)::text as count
      FROM access_logs a
      LEFT JOIN sources s ON s.id = a.source_id
      WHERE ${whereClause}
    `;
    const countRow = await queryOne<{ count: string }>(countQuery, params);
    const totalCount = parseInt(countRow?.count || '0', 10);

    // Fetch paginated log records
    const logsQuery = `
      SELECT 
        a.id,
        a.action,
        a.created_at,
        COALESCE(s.connector, 'system') as connector,
        COALESCE(s.external_id, 'workspace') as source_name,
        b.id as brief_id,
        b.question as brief_question,
        w.name as workspace_name
      FROM access_logs a
      LEFT JOIN sources s ON s.id = a.source_id
      LEFT JOIN briefs b ON b.id = a.brief_id
      LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const logs = await query(logsQuery, [...params, limit, offset]);

    return NextResponse.json({
      logs,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + logs.length < totalCount,
      },
      filters: {
        connector: connectorFilter || null,
        action: actionFilter || null,
        startDate: startDate || null,
        endDate: endDate || null,
      },
    });
  } catch (err: any) {
    console.error('List access logs error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
