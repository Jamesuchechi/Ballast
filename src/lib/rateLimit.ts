import { NextRequest, NextResponse } from 'next/server';
import { getSharedRedisClient } from '@/queue/redis';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

// In-memory sliding window fallback for local dev or temporary Redis downtime
const memoryFallbackMap = new Map<string, number[]>();

// Clean up stale memory map entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of memoryFallbackMap.entries()) {
      const valid = timestamps.filter((t) => now - t < 120000);
      if (valid.length === 0) {
        memoryFallbackMap.delete(key);
      } else {
        memoryFallbackMap.set(key, valid);
      }
    }
  }, 300000).unref?.();
}

/**
 * Extracts best-effort client IP from incoming request headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();
  return '127.0.0.1';
}

/**
 * Checks rate limit using Redis atomic sliding-window pipeline,
 * with seamless fallback to in-memory sliding window if Redis is unavailable.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `ratelimit:${key}`;

  try {
    const redis = getSharedRedisClient();
    if (redis.status === 'ready' || redis.status === 'connecting') {
      const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;

      // Atomic sliding window via sorted set
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(redisKey, 0, windowStart);
      pipeline.zadd(redisKey, now, member);
      pipeline.zcard(redisKey);
      pipeline.expire(redisKey, windowSeconds * 2);

      const results = await pipeline.exec();
      if (results && results[2] && results[2][1] !== null) {
        const count = results[2][1] as number;
        const success = count <= limit;
        const remaining = Math.max(0, limit - count);

        return {
          success,
          limit,
          remaining,
          resetSeconds: windowSeconds,
        };
      }
    }
  } catch (err) {
    // Redis unavailable: seamlessly fall back to memory
  }

  // In-memory sliding window fallback
  const timestamps = memoryFallbackMap.get(key) || [];
  const validTimestamps = timestamps.filter((t) => t > windowStart);
  validTimestamps.push(now);
  memoryFallbackMap.set(key, validTimestamps);

  const count = validTimestamps.length;
  const success = count <= limit;
  const remaining = Math.max(0, limit - count);

  return {
    success,
    limit,
    remaining,
    resetSeconds: windowSeconds,
  };
}

/**
 * Standard HTTP 429 response helper with RateLimit headers.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  message: string = 'Too many requests. Please slow down and try again.'
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'rate_limit_exceeded',
      retryAfter: result.resetSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.resetSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetSeconds),
      },
    }
  );
}
