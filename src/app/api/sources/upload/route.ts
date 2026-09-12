import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { ingestDocument, validateUpload } from '@/core/ingest';

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve workspace
    const sessionCookie = req.cookies.get('ballast_session');
    let workspaceId: string | null = null;

    if (sessionCookie?.value) {
      const user = await queryOne<{ id: string }>(
        `SELECT id FROM users WHERE id::text = $1`,
        [sessionCookie.value]
      );
      if (user) {
        const member = await queryOne<{ workspace_id: string }>(
          `SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`,
          [user.id]
        );
        if (member) workspaceId = member.workspace_id;
      }
    }

    if (!workspaceId) {
      // Fallback to default workspace
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
      }
      workspaceId = defaultWs.id;
    }

    // 2. Parse FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 3. Pre-validate size and extension
    try {
      validateUpload(file.name, file.size);
    } catch (valErr: any) {
      return NextResponse.json(
        { error: valErr.message },
        { status: file.size > 20 * 1024 * 1024 ? 413 : 400 }
      );
    }

    // 4. Ingest
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await ingestDocument({
      workspaceId,
      filename: file.name,
      buffer,
      mimeType: file.type || 'text/plain',
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('[API /api/sources/upload error]:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
