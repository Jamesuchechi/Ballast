import { query } from '@/db/client';
import { generateEmbedding, formatVectorForPg } from './embeddings';
import type { RetrievedQuote } from './types';
import type { SourceBlock } from './sourceFormatter';

export interface RetrievalOptions {
  workspaceId: string;
  queryText: string;
  limit?: number;
  briefId?: string;
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
  distance: number;
}

/**
 * Executes vector search in PostgreSQL with strict SQL-level workspace isolation (FR3.2, NFR5.2)
 */
export async function retrievePrivateChunks(
  options: RetrievalOptions
): Promise<RetrievalResult> {
  const { workspaceId, queryText, limit = 8, briefId } = options;

  // 1. Generate query embedding vector
  const queryVector = generateEmbedding(queryText);
  const vectorStr = formatVectorForPg(queryVector);

  // 2. Query pgvector with strict WHERE workspace_id = $2 (SQL ACL)
  const rows = await query<RawChunkRow>(
    `SELECT 
       c.id, 
       c.source_id, 
       c.text, 
       s.external_id, 
       s.checksum,
       (c.embedding <=> $1::vector) AS distance
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE c.workspace_id = $2
     ORDER BY c.embedding <=> $1::vector ASC
     LIMIT $3`,
    [vectorStr, workspaceId, limit]
  );

  // 3. Log access into access_logs for auditing (NFR2.4, NFR6.4)
  if (rows.length > 0) {
    try {
      await query(
        `INSERT INTO access_logs (
           workspace_id, source_id, brief_id, action
         ) VALUES ($1, $2, $3, $4)`,
        [
          workspaceId,
          rows[0].source_id,
          briefId || null,
          `retrieve_chunks: hits=${rows.length}`,
        ]
      );
    } catch (e) {
      // Non-fatal logging failure
      console.warn('[RETRIEVAL] Access log record failed:', e);
    }
  }

  // 4. Format into RetrievedQuote[] and SourceBlock[]
  const quotes: RetrievedQuote[] = rows.map((r, idx) => ({
    id: `quote_${r.id.slice(0, 8)}_${idx}`,
    source_id: r.source_id,
    quote: r.text,
    source_class: 'private',
    connector: 'upload',
    url: null,
  }));

  const sources: SourceBlock[] = rows.map((r) => ({
    id: r.source_id,
    source_id: r.source_id,
    class: 'private',
    connector: 'upload',
    body: r.text,
  }));

  return {
    quotes,
    sources,
    totalChunksSearched: rows.length,
  };
}
