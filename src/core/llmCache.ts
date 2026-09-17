import crypto from 'node:crypto';
import { getSharedRedisClient } from '@/queue/redis';
import type { LLMUsage } from './llm';

export interface CachedLLMPayload {
  text: string;
  usage: LLMUsage;
  provider: string;
  model: string;
  cachedAt: string;
}

export interface LLMCacheStats {
  hits: number;
  misses: number;
  hitRatePercent: number;
  memoryEntriesCount: number;
  redisConnected: boolean;
}

// In-memory fallback cache when Redis is disabled or offline
interface MemoryCacheEntry {
  payload: CachedLLMPayload;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();
const MAX_MEMORY_CACHE_ENTRIES = 500;

// Telemetry counters
let globalHits = 0;
let globalMisses = 0;

export const DEFAULT_LLM_CACHE_TTL_SECONDS = 86400; // 24 hours per E10 specification

/**
 * Derives a collision-resistant deterministic SHA-256 hash key for an LLM prompt configuration.
 */
export function computeLLMCacheKey(
  prompt: string,
  systemPrompt: string,
  options?: { role?: string; temperature?: number; preferredModel?: string }
): string {
  const normPrompt = prompt.trim();
  const normSys = (systemPrompt || '').trim();
  const role = options?.role || 'writer';
  const temp = options?.temperature ?? 0.2;
  const model = options?.preferredModel || 'default';

  const raw = `v1:${role}:${model}:${temp}:${normSys}---${normPrompt}`;
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  return `llm:cache:${hash}`;
}

/**
 * Retrieves a cached LLM response from Redis (or in-memory fallback).
 */
export async function getCachedLLMResponse(
  cacheKey: string
): Promise<CachedLLMPayload | null> {
  const isEnabled = process.env.LLM_CACHE_ENABLED !== 'false';
  if (!isEnabled) {
    return null;
  }

  // 1. Try Redis first
  try {
    const redis = getSharedRedisClient();
    if (redis && (redis.status === 'ready' || redis.status === 'connect' || redis.status === 'connecting')) {
      const cachedJson = await redis.get(cacheKey);
      if (cachedJson) {
        const parsed: CachedLLMPayload = JSON.parse(cachedJson);
        globalHits++;
        // Track hit in Redis stats counter asynchronously
        redis.incr('llm:cache:stats:hits').catch(() => {});
        return parsed;
      }
    }
  } catch (err: any) {
    // Redis read failed, fallback transparently to in-memory store
  }

  // 2. Check in-memory store fallback
  const memEntry = memoryCache.get(cacheKey);
  if (memEntry) {
    if (Date.now() < memEntry.expiresAt) {
      globalHits++;
      return memEntry.payload;
    } else {
      memoryCache.delete(cacheKey);
    }
  }

  globalMisses++;
  try {
    const redis = getSharedRedisClient();
    if (redis && redis.status === 'ready') {
      redis.incr('llm:cache:stats:misses').catch(() => {});
    }
  } catch {}

  return null;
}

/**
 * Caches an LLM generation response with a 24-hour TTL.
 */
export async function setCachedLLMResponse(
  cacheKey: string,
  payload: CachedLLMPayload,
  ttlSeconds = DEFAULT_LLM_CACHE_TTL_SECONDS
): Promise<void> {
  const isEnabled = process.env.LLM_CACHE_ENABLED !== 'false';
  if (!isEnabled) {
    return;
  }

  // 1. Write to Redis
  try {
    const redis = getSharedRedisClient();
    if (redis && (redis.status === 'ready' || redis.status === 'connect' || redis.status === 'connecting')) {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', ttlSeconds);
    }
  } catch (err: any) {
    // Graceful degrade: continue to in-memory fallback
  }

  // 2. Write to in-memory cache fallback
  if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    // Evict oldest entry
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }

  memoryCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Returns live LLM cache performance and cost-saving metrics.
 */
export async function getLLMCacheStats(): Promise<LLMCacheStats> {
  let redisHits = 0;
  let redisMisses = 0;
  let redisConnected = false;

  try {
    const redis = getSharedRedisClient();
    if (redis && redis.status === 'ready') {
      redisConnected = true;
      const [h, m] = await Promise.all([
        redis.get('llm:cache:stats:hits'),
        redis.get('llm:cache:stats:misses'),
      ]);
      redisHits = parseInt(h || '0', 10);
      redisMisses = parseInt(m || '0', 10);
    }
  } catch {}

  const totalHits = Math.max(globalHits, redisHits);
  const totalMisses = Math.max(globalMisses, redisMisses);
  const totalCalls = totalHits + totalMisses;
  const hitRatePercent = totalCalls > 0 ? Math.round((totalHits / totalCalls) * 100) : 0;

  return {
    hits: totalHits,
    misses: totalMisses,
    hitRatePercent,
    memoryEntriesCount: memoryCache.size,
    redisConnected,
  };
}

/**
 * Purges the LLM cache (for tests or administrative invalidation).
 */
export async function clearLLMCache(): Promise<void> {
  memoryCache.clear();
  globalHits = 0;
  globalMisses = 0;

  try {
    const redis = getSharedRedisClient();
    if (redis && redis.status === 'ready') {
      const keys = await redis.keys('llm:cache:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del('llm:cache:stats:hits', 'llm:cache:stats:misses');
    }
  } catch {}
}
