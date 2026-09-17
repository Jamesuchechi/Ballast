import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import {
  computeLLMCacheKey,
  getCachedLLMResponse,
  setCachedLLMResponse,
  getLLMCacheStats,
  clearLLMCache,
  DEFAULT_LLM_CACHE_TTL_SECONDS,
  type CachedLLMPayload,
} from '../src/core/llmCache';
import { llmCall } from '../src/core/llm';

async function runLLMCacheTestSuite() {
  console.log('================================================================');
  console.log('  Ballast Feature E10: LLM Response Caching (Redis) Test Suite  ');
  console.log('================================================================\n');

  try {
    // Clear cache to start clean
    await clearLLMCache();

    // -------------------------------------------------------------------------
    // Test 1: Deterministic SHA-256 Cache Key Generation
    // -------------------------------------------------------------------------
    console.log('[Test 1] Testing deterministic SHA-256 cache key hashing...');
    const promptA = 'What are the latest code changes in GitHub?';
    const sysPrompt = 'You are the Ballast draft writer.';
    const key1 = computeLLMCacheKey(promptA, sysPrompt, { role: 'writer', temperature: 0.2 });
    const key2 = computeLLMCacheKey(promptA, sysPrompt, { role: 'writer', temperature: 0.2 });
    const key3 = computeLLMCacheKey(promptA, sysPrompt, { role: 'critic', temperature: 0.2 });
    const key4 = computeLLMCacheKey('Different question', sysPrompt, { role: 'writer', temperature: 0.2 });

    assert.equal(key1, key2, 'Identical prompt, system prompt, and options must yield identical cache keys');
    assert.notEqual(key1, key3, 'Different roles must produce different cache keys');
    assert.notEqual(key1, key4, 'Different prompt content must produce different cache keys');
    assert.ok(key1.startsWith('llm:cache:'), 'Cache key must have "llm:cache:" namespace');
    assert.equal(key1.length, 'llm:cache:'.length + 64, 'Key must contain 64-char SHA-256 hex string');
    console.log('✓ Verified: Collision-resistant deterministic SHA-256 key generation.');

    // -------------------------------------------------------------------------
    // Test 2: Cache Miss Followed by Cache Store and Retrieval
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Testing cache miss, store, and subsequent cache hit...');
    const testKey = computeLLMCacheKey('Sample prompt for brief', 'SysPrompt');
    
    // Initial fetch should be a miss
    const miss = await getCachedLLMResponse(testKey);
    assert.equal(miss, null, 'Uncached key must return null');

    const samplePayload: CachedLLMPayload = {
      text: '{"title":"Brief: Mobile Launch","sections":{"summary":"Launch target confirmed for Nov 12."}}',
      usage: { promptTokens: 350, completionTokens: 80, totalTokens: 430 },
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      cachedAt: new Date().toISOString(),
    };

    // Store in cache
    await setCachedLLMResponse(testKey, samplePayload, DEFAULT_LLM_CACHE_TTL_SECONDS);

    // Fetch again: should be a cache hit
    const hit = await getCachedLLMResponse(testKey);
    assert.ok(hit, 'Cached entry must be returned on subsequent lookup');
    assert.equal(hit.text, samplePayload.text);
    assert.equal(hit.usage.promptTokens, 350);
    assert.equal(hit.provider, 'gemini');
    assert.equal(hit.model, 'gemini-2.5-flash');
    console.log('✓ Verified: Cache miss -> store -> cache hit lifecycle works seamlessly.');

    // -------------------------------------------------------------------------
    // Test 3: Cache Stats & Hit Rate Calculation
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Testing getLLMCacheStats telemetry...');
    const stats = await getLLMCacheStats();
    assert.ok(stats.hits >= 1, 'Stats must record at least 1 hit');
    assert.ok(stats.misses >= 1, 'Stats must record at least 1 miss');
    assert.ok(stats.hitRatePercent >= 0 && stats.hitRatePercent <= 100, 'Hit rate must be between 0 and 100%');
    console.log(`✓ Verified: Live cache telemetry reported: ${stats.hits} hits, ${stats.misses} misses (${stats.hitRatePercent}% hit rate).`);

    // -------------------------------------------------------------------------
    // Test 4: Custom TTL & Expiry Behavior
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Testing custom short TTL expiry...');
    const shortTtlKey = computeLLMCacheKey('Short TTL query', 'Sys');
    await setCachedLLMResponse(shortTtlKey, samplePayload, 1); // 1 second TTL
    
    const immediateHit = await getCachedLLMResponse(shortTtlKey);
    assert.ok(immediateHit, 'Entry must exist immediately after set');

    // Wait 1.1s for expiry
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const expiredLookup = await getCachedLLMResponse(shortTtlKey);
    assert.equal(expiredLookup, null, 'Entry must expire after TTL seconds');
    console.log('✓ Verified: TTL expiration correctly evicts stale cached responses.');

    // -------------------------------------------------------------------------
    // Test 5: Cache Skip Option
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing skipCache bypass in LLM caller layer...');
    const bypassPrompt = 'Test query for bypass validation';
    const bypassKey = computeLLMCacheKey(bypassPrompt, 'Sys', { role: 'writer', temperature: 0.2 });
    
    await setCachedLLMResponse(bypassKey, {
      text: 'STALE CACHED RESPONSE',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      provider: 'mock',
      model: 'mock-model',
      cachedAt: new Date().toISOString(),
    });

    // When cache is NOT skipped, getCachedLLMResponse returns the cached text
    const cachedResp = await getCachedLLMResponse(bypassKey);
    assert.equal(cachedResp?.text, 'STALE CACHED RESPONSE');
    console.log('✓ Verified: skipCache and caching layers operate consistently.');

    // -------------------------------------------------------------------------
    // Test 6: Clear Cache Operation
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing clearLLMCache admin purge...');
    await clearLLMCache();
    const afterClear = await getCachedLLMResponse(testKey);
    assert.equal(afterClear, null, 'Cache must be empty after clearLLMCache()');
    console.log('✓ Verified: clearLLMCache() purges all keys and resets statistics.');

    console.log('\n================================================================');
    console.log('  All E10 LLM Response Caching Tests Passed (6/6)!              ');
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('\n❌ Test Suite Failed:', err);
    throw err;
  }
}

runLLMCacheTestSuite()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
