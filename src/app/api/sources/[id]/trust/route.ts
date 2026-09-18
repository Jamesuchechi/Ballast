import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import type { TrustBoundary } from '@/core/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const source = await queryOne<{
      id: string;
      connector: string;
      external_id: string;
      trust_boundary: TrustBoundary;
      synced_at: string;
      meta: any;
    }>(
      `SELECT id, connector, external_id, trust_boundary, synced_at, meta 
       FROM sources 
       WHERE id = $1 AND workspace_id = $2`,
      [id, session.workspaceId]
    );

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json({ source });
  } catch (err: any) {
    console.error('[API GET /api/sources/[id]/trust error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rawTrust = body.trustBoundary || body.trust_boundary || body.trust;

    if (rawTrust !== 'verified' && rawTrust !== 'untrusted_content') {
      return NextResponse.json(
        { error: "Invalid trust boundary. Must be 'verified' or 'untrusted_content'." },
        { status: 400 }
      );
    }

    const trustBoundary: TrustBoundary = rawTrust;

    // Check existing source
    const existing = await queryOne<{ id: string; trust_boundary: string; external_id: string; connector: string }>(
      `SELECT id, trust_boundary, external_id, connector 
       FROM sources 
       WHERE id = $1 AND workspace_id = $2`,
      [id, session.workspaceId]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const previousTrust = existing.trust_boundary;

    // Update trust level
    const updated = await query<{
      id: string;
      connector: string;
      external_id: string;
      trust_boundary: TrustBoundary;
      synced_at: string;
      meta: any;
    }>(
      `UPDATE sources 
       SET trust_boundary = $1 
       WHERE id = $2 AND workspace_id = $3 
       RETURNING id, connector, external_id, trust_boundary, synced_at, meta`,
      [trustBoundary, id, session.workspaceId]
    );

    // Record audit trail in access_logs
    try {
      await query(
        `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
         VALUES ($1, $2, null, $3)`,
        [
          session.workspaceId,
          id,
          `source_trust_update:${id} connector=${existing.connector} external_id=${existing.external_id} from=${previousTrust} to=${trustBoundary}`,
        ]
      );
    } catch (logErr) {
      console.warn('[API /api/sources/[id]/trust] Failed recording access log:', logErr);
    }

    return NextResponse.json({
      success: true,
      source: updated[0],
      message: `Source trust level upgraded to '${trustBoundary}'.`,
    });
  } catch (err: any) {
    console.error('[API PATCH /api/sources/[id]/trust error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to update trust boundary' }, { status: 500 });
  }
}
