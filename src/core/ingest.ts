import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { query, queryOne } from '@/db/client';
import { chunkAndEmbedText } from './embeddings';
import { scanBufferForMalware } from './scanner';
// @ts-ignore - bypass index.js debug auto-run issue in pdf-parse
import pdf from 'pdf-parse/lib/pdf-parse.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB cap (NFR3.4)

export const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.csv',
]);

export interface IngestOptions {
  workspaceId: string;
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

export interface IngestResult {
  sourceId: string;
  checksum: string;
  filename: string;
  chunkCount: number;
  sizeBytes: number;
  deduplicated: boolean;
}

/**
 * Validates file size and extension according to NFR3.4 allowlist
 */
export function validateUpload(filename: string, sizeBytes: number): { ext: string } {
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(`File size (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the 20 MB limit (NFR3.4)`);
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `File extension '${ext}' is not permitted. Allowed: txt, md, pdf, png, jpg, jpeg, csv (NFR3.4)`
    );
  }

  return { ext };
}

/**
 * Extracts visible text and factual descriptions from images using Gemini Multimodal Vision.
 */
async function extractTextFromImage(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    if (isMockAllowed) {
      return `[Image Asset: ${filename}]\nMock visual text and OCR data extracted for testing.`;
    }
    throw new Error(
      `Image ingestion for '${filename}' requires GEMINI_API_KEY for multimodal text and visual extraction. Please configure GEMINI_API_KEY or upload text, markdown, or PDF documents.`
    );
  }

  const base64Data = buffer.toString('base64');
  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'You are an expert document and image understanding engine for Ballast. Analyze this image thoroughly for information retrieval. Transcribe any and all visible text, numbers, code, labels, or tables verbatim. Accurately describe diagrams, visual facts, entities, and charts. Output the extracted text and structured factual description directly without conversational filler.',
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[INGEST] Gemini vision model ${model} failed (${res.status}): ${errText.slice(0, 150)}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim().length > 0) {
        return `[Image Document: ${filename}]\n\n${text.trim()}`;
      }
    } catch (err: any) {
      console.warn(`[INGEST] Gemini vision model ${model} error:`, err?.message);
    }
  }

  if (isMockAllowed) {
    return `[Image Asset: ${filename}]\nFallback mock visual text extracted for test environment.`;
  }

  throw new Error(
    `Failed to extract multimodal content from image '${filename}'. All vision models failed or returned empty content.`
  );
}

/**
 * Extracts plain text from an uploaded file buffer based on extension
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  ext: string,
  filename: string,
  mimeType?: string
): Promise<string> {
  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    return buffer.toString('utf-8');
  }

  if (ext === '.pdf') {
    try {
      const parsed = await pdf(buffer);
      const text = (parsed?.text || '').trim();
      if (text.length > 0) {
        return text;
      }
    } catch (err: any) {
      console.warn(`[INGEST] pdf-parse extraction failed for ${filename}:`, err?.message);
    }

    // Secondary fallback: Extract uncompressed text objects from PDF streams
    const raw = buffer.toString('latin1');
    const textBlocks: string[] = [];
    const textRegex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = textRegex.exec(raw)) !== null) {
      if (match[1]) textBlocks.push(match[1]);
    }
    if (textBlocks.length > 0) {
      return textBlocks.join(' ');
    }

    throw new Error(
      `Failed to extract text from PDF '${filename}'. The document contains no extractable text or is password-protected.`
    );
  }

  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    const resolvedMime =
      mimeType && mimeType.startsWith('image/')
        ? mimeType
        : ext === '.png'
        ? 'image/png'
        : 'image/jpeg';
    return await extractTextFromImage(buffer, resolvedMime, filename);
  }

  return buffer.toString('utf-8');
}

/**
 * Ingests an uploaded file or pasted text snippet into sources and chunks
 */
export async function ingestDocument(options: IngestOptions): Promise<IngestResult> {
  const { workspaceId, filename, buffer, mimeType = 'text/plain' } = options;

  // 1. Validate
  const { ext } = validateUpload(filename, buffer.length);

  // 1.5 Scan for malware, viruses, and disguised binary/script payloads (M2)
  const scanResult = await scanBufferForMalware(buffer, filename);
  if (!scanResult.clean) {
    try {
      await query(
        `INSERT INTO access_logs (workspace_id, action) VALUES ($1, $2)`,
        [workspaceId, `source.malware_blocked:${scanResult.threatName || 'threat'}`]
      );
    } catch (logErr) {
      console.error('[Scanner] Failed to write access log for blocked malware:', logErr);
    }
    throw new Error(
      `[MALWARE DETECTED] File '${filename}' failed malware/virus scan: ${scanResult.threatName} - ${scanResult.details}`
    );
  }

  // 2. Compute SHA-256 checksum for deduplication (FR2.10)
  const checksum = createHash('sha256').update(buffer).digest('hex');

  // Check if identical or updated source already exists in this workspace by external_id (Task D3)
  const existingSource = await queryOne<{ id: string; checksum: string }>(
    `SELECT id, checksum FROM sources WHERE workspace_id = $1 AND connector = 'upload' AND external_id = $2 LIMIT 1`,
    [workspaceId, filename]
  );

  if (existingSource) {
    if (existingSource.checksum === checksum) {
      const chunkRows = await query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM chunks WHERE source_id = $1`,
        [existingSource.id]
      );
      const count = parseInt(chunkRows[0]?.count || '0', 10);
      return {
        sourceId: existingSource.id,
        checksum,
        filename,
        chunkCount: count,
        sizeBytes: buffer.length,
        deduplicated: true,
      };
    }

    // File re-uploaded with updated content: extract text, update source, replace old chunks
    const extractedText = await extractTextFromBuffer(buffer, ext, filename, mimeType);
    const rawUri = `upload://${workspaceId}/${filename}_${checksum.slice(0, 8)}`;
    await query(
      `UPDATE sources SET checksum = $2, raw_uri = $3, synced_at = NOW(), meta = $4::jsonb WHERE id = $1`,
      [
        existingSource.id,
        checksum,
        rawUri,
        JSON.stringify({ filename, size: buffer.length, mimeType }),
      ]
    );
    await query(`DELETE FROM chunks WHERE source_id = $1`, [existingSource.id]);
    const chunkCount = await chunkAndEmbedText({
      workspaceId,
      sourceId: existingSource.id,
      text: extractedText,
      sourceName: filename,
    });
    return {
      sourceId: existingSource.id,
      checksum,
      filename,
      chunkCount,
      sizeBytes: buffer.length,
      deduplicated: false,
    };
  }

  // 3. Extract text
  const extractedText = await extractTextFromBuffer(buffer, ext, filename, mimeType);

  // 4. Persist to sources table
  const rawUri = `upload://${workspaceId}/${filename}_${checksum.slice(0, 8)}`;
  const sourceRows = await query<{ id: string }>(
    `INSERT INTO sources (
      workspace_id, connector, external_id, checksum, trust_boundary,
      synced_at, raw_uri, meta
    ) VALUES (
      $1, 'upload', $2, $3, 'untrusted_content',
      NOW(), $4, $5
    ) RETURNING id`,
    [
      workspaceId,
      filename,
      checksum,
      rawUri,
      JSON.stringify({ filename, size: buffer.length, mimeType }),
    ]
  );

  const sourceId = sourceRows[0].id;

  // 5. Chunk and Embed into pgvector (FR3.1)
  const chunkCount = await chunkAndEmbedText({
    workspaceId,
    sourceId,
    text: extractedText,
    sourceName: filename,
  });

  return {
    sourceId,
    checksum,
    filename,
    chunkCount,
    sizeBytes: buffer.length,
    deduplicated: false,
  };
}

/**
 * Ingests a raw pasted text snippet
 */
export async function ingestPastedSnippet(
  workspaceId: string,
  title: string,
  text: string
): Promise<IngestResult> {
  const cleanTitle = (title.trim() || 'Pasted Notes').replace(/[^a-zA-Z0-9._-]/g, '_') + '.txt';
  const buffer = Buffer.from(text.trim(), 'utf-8');

  return ingestDocument({
    workspaceId,
    filename: cleanTitle,
    buffer,
    mimeType: 'text/plain',
  });
}
