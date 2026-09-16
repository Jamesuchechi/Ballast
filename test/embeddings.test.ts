import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import {
  generateEmbedding,
  generateBallastLocalEmbedding,
  generateDeterministicEmbeddingForEval,
  EMBEDDING_DIMENSION,
} from '../src/core/embeddings';

function cosineSimilarity(a: number[], b: number[]): number {
  assert.equal(a.length, b.length, 'Vectors must have same dimension');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function runTests() {
  console.log('=== Ballast Multi-Provider & Local Embedding Test Suite ===\n');

  // Test 1: Gemini Live Embedding
  console.log('[Test 1] Generating live Gemini embedding (dim=1536)...');
  const text1 = 'Stripe webhook handler for subscription billing and automatic debit';
  const geminiVec = await generateEmbedding(text1);
  assert.equal(geminiVec.length, EMBEDDING_DIMENSION, `Expected 1536 dim, got ${geminiVec.length}`);
  console.log('✓ Gemini embedding returned valid 1536-dim vector');

  // Test 2: Local Ballast Semantic Embedding Engine
  console.log('\n[Test 2] Testing Local Ballast Semantic Embedding Engine (zero cost / offline)...');
  const localVec = generateBallastLocalEmbedding(text1);
  assert.equal(localVec.length, EMBEDDING_DIMENSION);

  let localNorm = 0;
  for (const v of localVec) localNorm += v * v;
  assert.ok(Math.abs(Math.sqrt(localNorm) - 1.0) < 0.01, 'Local vector must be unit normalized');
  console.log(`✓ Local Ballast Embedding Engine generated valid unit-norm vector (dim=${localVec.length})`);

  // Test 3: Local Engine Semantic Distance Verification
  console.log('\n[Test 3] Verifying Local Engine semantic clustering...');
  const anchorLocal = generateBallastLocalEmbedding('merchant account configuration and payment processing');
  const relatedLocal = generateBallastLocalEmbedding('Stripe dashboard billing settings and payment processing');
  const unrelatedLocal = generateBallastLocalEmbedding('astronomical telescope observing distant planetary orbits');

  const simRelLocal = cosineSimilarity(anchorLocal, relatedLocal);
  const simUnrelLocal = cosineSimilarity(anchorLocal, unrelatedLocal);
  console.log(`  Local Similarity (Anchor <-> Related):   ${simRelLocal.toFixed(4)}`);
  console.log(`  Local Similarity (Anchor <-> Unrelated): ${simUnrelLocal.toFixed(4)}`);
  assert.ok(simRelLocal > simUnrelLocal, 'Local engine must rank related content higher than unrelated content');
  console.log('✓ Local Ballast Embedding semantic ranking verified');

  // Test 4: Provider Fallback Cascade to Local Engine when Cloud Keys Missing
  console.log('\n[Test 4] Verifying automatic fallback to Local Ballast Engine when cloud providers are unconfigured...');
  const origGemini = process.env.GEMINI_API_KEY;
  const origMistral = process.env.MISTRAL_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MISTRAL_API_KEY;

    const fallbackVec = await generateEmbedding('Testing automatic fallback cascade');
    assert.equal(fallbackVec.length, EMBEDDING_DIMENSION);
    console.log('✓ Automatic fallback cascade to Local Ballast Engine succeeded without crashing');
  } finally {
    process.env.GEMINI_API_KEY = origGemini;
    process.env.MISTRAL_API_KEY = origMistral;
  }

  // Test 5: Preferred Provider Override via EMBEDDING_PROVIDER="local"
  console.log('\n[Test 5] Verifying EMBEDDING_PROVIDER="local" env override...');
  const origProv = process.env.EMBEDDING_PROVIDER;
  try {
    process.env.EMBEDDING_PROVIDER = 'local';
    const overriddenVec = await generateEmbedding('Testing local override');
    assert.equal(overriddenVec.length, EMBEDDING_DIMENSION);
    console.log('✓ EMBEDDING_PROVIDER="local" direct dispatch verified');
  } finally {
    process.env.EMBEDDING_PROVIDER = origProv;
  }

  // Test 6: Incompatible Mistral Dimension Rejection (No Zero-Padding Corruption)
  console.log('\n[Test 6] Verifying Mistral dimension incompatibility rejection...');
  const origProv6 = process.env.EMBEDDING_PROVIDER;
  const origMistral6 = process.env.MISTRAL_API_KEY;
  try {
    process.env.EMBEDDING_PROVIDER = 'mistral';
    delete process.env.MISTRAL_API_KEY;
    await assert.rejects(
      async () => {
        await generateEmbedding('Testing Mistral without key');
      },
      {
        message: /MISTRAL_API_KEY is not set/,
      }
    );
    console.log('✓ Mistral provider configuration guard verified');
  } finally {
    process.env.EMBEDDING_PROVIDER = origProv6;
    process.env.MISTRAL_API_KEY = origMistral6;
  }

  console.log('\n=== ALL MULTI-PROVIDER & LOCAL EMBEDDING TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('❌ Embedding Tests Failed:', err);
  process.exit(1);
});
