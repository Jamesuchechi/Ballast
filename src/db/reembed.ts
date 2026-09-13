import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from './client';
import { generateEmbedding, formatVectorForPg } from '@/core/embeddings';

export async function reembedAllChunks() {
  console.log('=== Ballast Embedding Migration: Re-embedding All Chunks ===');
  const startTime = Date.now();

  const chunks = await query<{ id: string; text: string }>(
    `SELECT id, text FROM chunks ORDER BY created_at ASC`
  );

  console.log(`Found ${chunks.length} chunks to re-embed.\n`);

  let count = 0;
  for (const chunk of chunks) {
    count++;
    console.log(`[${count}/${chunks.length}] Re-embedding chunk ${chunk.id.slice(0, 8)}... (${chunk.text.slice(0, 50).replace(/\n/g, ' ')}...)`);
    
    const embedding = await generateEmbedding(chunk.text);
    const vectorStr = formatVectorForPg(embedding);

    await query(
      `UPDATE chunks SET embedding = $1::vector WHERE id = $2`,
      [vectorStr, chunk.id]
    );
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Successfully re-embedded ${chunks.length} chunks in ${durationSec}s.`);
}

if (process.argv[1]?.endsWith('reembed.ts')) {
  reembedAllChunks()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Re-embedding migration failed:', err);
      pool.end();
      process.exit(1);
    });
}
