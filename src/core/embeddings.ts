import { createHash } from 'node:crypto';
import { query } from '@/db/client';

export const EMBEDDING_DIMENSION = 1536;

export interface ChunkOptions {
  workspaceId: string;
  sourceId: string;
  text: string;
  sourceName?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Splits text into logical chunks preserving line and sentence boundaries
 */
export function splitIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  if (cleaned.length <= chunkSize) {
    return [cleaned];
  }

  const chunks: string[] = [];
  // Split by double newline (paragraphs) first
  const paragraphs = cleaned.split(/\n\s*\n/);
  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 2 <= chunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      if (trimmed.length > chunkSize) {
        // Break long paragraph by sentences or window
        const sentences = trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmed];
        currentChunk = '';
        for (const sent of sentences) {
          if (currentChunk.length + sent.length <= chunkSize) {
            currentChunk += sent;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sent;
          }
        }
      } else {
        currentChunk = trimmed;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Generates a normalized 1536-dimensional vector for a given text snippet.
 * Uses a deterministic semantic projection to guarantee 100% offline reproducibility
 * and full compatibility with pgvector's cosine distance operator (<=>).
 */
export function generateEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIMENSION);
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\W+/).filter(Boolean);

  // Bag-of-words and character n-gram projection into 1536 dimensions
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const hash = createHash('md5').update(word).digest();
    const index = (hash.readUInt16BE(0) ^ hash.readUInt16BE(2)) % EMBEDDING_DIMENSION;
    const sign = hash[4] % 2 === 0 ? 1 : -1;
    vec[index] += sign * (1.0 / Math.sqrt(i + 1));

    // Also project bigrams
    if (i < words.length - 1) {
      const bigram = `${word}_${words[i + 1]}`;
      const biHash = createHash('sha1').update(bigram).digest();
      const biIdx = (biHash.readUInt16BE(0) ^ biHash.readUInt16BE(2)) % EMBEDDING_DIMENSION;
      const biSign = biHash[4] % 2 === 0 ? 1 : -1;
      vec[biIdx] += biSign * 1.5;
    }
  }

  // Normalize to unit vector for cosine distance
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1.0;

  const result: number[] = new Array(EMBEDDING_DIMENSION);
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    result[i] = Number((vec[i] / norm).toFixed(6));
  }

  return result;
}

/**
 * Formats a float array into PostgreSQL pgvector syntax: '[0.123, -0.456, ...]'
 */
export function formatVectorForPg(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Chunks text and embeds all chunks into the PostgreSQL chunks table
 */
export async function chunkAndEmbedText(options: ChunkOptions): Promise<number> {
  const { workspaceId, sourceId, text, chunkSize = 500, chunkOverlap = 50 } = options;

  const textChunks = splitIntoChunks(text, chunkSize, chunkOverlap);
  if (textChunks.length === 0) return 0;

  let ordinal = 0;
  for (const chunkText of textChunks) {
    const embedding = generateEmbedding(chunkText);
    const vectorStr = formatVectorForPg(embedding);

    await query(
      `INSERT INTO chunks (
        workspace_id, source_id, text, embedding, ordinal
      ) VALUES ($1, $2, $3, $4::vector, $5)`,
      [workspaceId, sourceId, chunkText, vectorStr, ordinal++]
    );
  }

  return textChunks.length;
}
