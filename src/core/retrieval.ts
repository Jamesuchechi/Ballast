import { query } from '@/db/client';
import { generateEmbedding, formatVectorForPg } from './embeddings';
import type { RetrievedQuote } from './types';
import type { SourceBlock } from './sourceFormatter';

export const DEFAULT_MAX_DISTANCE = 0.85;

export interface RetrievalOptions {
  workspaceId: string;
  queryText: string;
  limit?: number;
  briefId?: string;
  maxDistance?: number;
}

export interface RetrievalResult {
  quotes: RetrievedQuote[];
  sources: SourceBlock[];
  totalChunksSearched: number;
}

interface RawChunkRow {
  id: string;
  source_id: string;
  text: string;
  external_id: string;
  checksum: string;
  connector: string;
  trust_boundary?: string;
  raw_uri?: string | null;
  distance: number;
}

/**
 * Executes private vector search in PostgreSQL with strict SQL-level workspace isolation (FR3.2, FR3.3).
 * Never returns chunks where connector = 'web'.
 */
export async function retrievePrivateChunks(
  options: RetrievalOptions
): Promise<RetrievalResult> {
  const { workspaceId, queryText, limit = 8, briefId } = options;

  // 1. Generate query embedding vector
  const queryVector = await generateEmbedding(queryText);
  const vectorStr = formatVectorForPg(queryVector);

  const maxDistance =
    options.maxDistance ??
    (process.env.RETRIEVAL_MAX_DISTANCE ? parseFloat(process.env.RETRIEVAL_MAX_DISTANCE) : DEFAULT_MAX_DISTANCE);

  // 2. Query pgvector for private sources only with distance threshold filter (s.connector != 'web')
  const rows = await query<RawChunkRow>(
    `SELECT 
       c.id, 
       c.source_id, 
       c.text, 
       s.external_id, 
       s.checksum,
       s.connector,
       s.trust_boundary,
       s.raw_uri,
       (c.embedding <=> $1::vector) AS distance
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE c.workspace_id = $2 
       AND s.connector != 'web'
       AND c.embedding IS NOT NULL
       AND (c.embedding <=> $1::vector) <= $3
     ORDER BY c.embedding <=> $1::vector ASC
     LIMIT $4`,
    [vectorStr, workspaceId, maxDistance, limit]
  );

  // 3. Log access into access_logs for auditing all accessed private sources (NFR2.4, NFR6.4)
  if (rows.length > 0) {
    try {
      const distinctSourceIds = Array.from(new Set(rows.map((r) => r.source_id)));
      for (const sId of distinctSourceIds) {
        const hitsCount = rows.filter((r) => r.source_id === sId).length;
        await query(
          `INSERT INTO access_logs (
             workspace_id, source_id, brief_id, action
           ) VALUES ($1, $2, $3, $4)`,
          [
            workspaceId,
            sId,
            briefId || null,
            `retrieve_private_chunks: hits=${hitsCount}`,
          ]
        );
      }
    } catch (e) {
      console.warn('[RETRIEVAL] Access log record failed:', e);
    }
  }

  // 4. Format into RetrievedQuote[] and SourceBlock[] tagged source_class='private'
  const quotes: RetrievedQuote[] = rows.map((r, idx) => {
    const dist = Number(r.distance);
    return {
      id: `quote_priv_${r.id.slice(0, 8)}_${idx}`,
      source_id: r.source_id,
      quote: r.text,
      source_class: 'private',
      connector: (r.connector || 'upload') as any,
      url: null,
      distance: dist,
      similarity: Number((1 - dist).toFixed(4)),
      trust_boundary: r.trust_boundary === 'verified' ? 'verified' : 'untrusted_content',
    };
  });

  const sources: SourceBlock[] = rows.map((r) => ({
    id: r.source_id,
    source_id: r.source_id,
    class: 'private',
    connector: (r.connector || 'upload') as any,
    body: r.text,
    trust_boundary: r.trust_boundary === 'verified' ? 'verified' : 'untrusted_content',
  }));

  return {
    quotes,
    sources,
    totalChunksSearched: rows.length,
  };
}

/**
 * Executes separate web vector search in PostgreSQL (FR3.3).
 * Queries only chunks where s.connector = 'web' and tags every result source_class='web'.
 */
export async function retrieveWebChunks(
  options: RetrievalOptions
): Promise<RetrievalResult> {
  const { workspaceId, queryText, limit = 6, briefId } = options;

  const queryVector = await generateEmbedding(queryText);
  const vectorStr = formatVectorForPg(queryVector);

  const maxDistance =
    options.maxDistance ??
    (process.env.RETRIEVAL_MAX_DISTANCE ? parseFloat(process.env.RETRIEVAL_MAX_DISTANCE) : DEFAULT_MAX_DISTANCE);

  const rows = await query<RawChunkRow>(
    `SELECT 
       c.id, 
       c.source_id, 
       c.text, 
       s.external_id, 
       s.checksum,
       s.connector,
       s.raw_uri,
       (c.embedding <=> $1::vector) AS distance
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE c.workspace_id = $2 
       AND s.connector = 'web'
       AND c.embedding IS NOT NULL
       AND (c.embedding <=> $1::vector) <= $3
     ORDER BY c.embedding <=> $1::vector ASC
     LIMIT $4`,
    [vectorStr, workspaceId, maxDistance, limit]
  );

  if (rows.length > 0) {
    try {
      const distinctSourceIds = Array.from(new Set(rows.map((r) => r.source_id)));
      for (const sId of distinctSourceIds) {
        const hitsCount = rows.filter((r) => r.source_id === sId).length;
        await query(
          `INSERT INTO access_logs (
             workspace_id, source_id, brief_id, action
           ) VALUES ($1, $2, $3, $4)`,
          [
            workspaceId,
            sId,
            briefId || null,
            `retrieve_web_chunks: hits=${hitsCount}`,
          ]
        );
      }
    } catch (e) {
      console.warn('[RETRIEVAL] Web access log record failed:', e);
    }
  }

  const quotes: RetrievedQuote[] = rows.map((r, idx) => {
    const dist = Number(r.distance);
    return {
      id: `quote_web_${r.id.slice(0, 8)}_${idx}`,
      source_id: r.source_id,
      quote: r.text,
      source_class: 'web',
      connector: 'web',
      url: r.raw_uri || r.external_id,
      distance: dist,
      similarity: Number((1 - dist).toFixed(4)),
    };
  });

  const sources: SourceBlock[] = rows.map((r) => ({
    id: r.source_id,
    source_id: r.source_id,
    class: 'web',
    connector: 'web',
    body: r.text,
  }));

  return {
    quotes,
    sources,
    totalChunksSearched: rows.length,
  };
}
