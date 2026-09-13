import { NextRequest, NextResponse } from 'next/server';
import { ingestDocument, validateUpload } from '@/core/ingest';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve workspace
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

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
