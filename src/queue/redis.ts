import { Redis, RedisOptions } from 'ioredis';

/**
 * Returns the configured Redis connection URL.
 * Supports:
 * 1. UPSTASH_REDIS_URL (e.g. rediss://default:xxx@xxx.upstash.io:6379)
 * 2. REDIS_URL (e.g. redis://localhost:6388 or rediss://...)
 * 3. Derived from UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * 4. Default fallback to local docker container redis://localhost:6388
 */
export function getRedisUrl(): string {
  if (process.env.UPSTASH_REDIS_URL) {
    return process.env.UPSTASH_REDIS_URL;
  }
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const restUrl = process.env.UPSTASH_REDIS_REST_URL;
    const host = restUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    return `rediss://default:${token}@${host}:6379`;
  }
  return 'redis://localhost:6388';
}

/**
 * Returns ioredis options configured for BullMQ and Upstash Redis compatibility:
 * - maxRetriesPerRequest: null (required by BullMQ)
 * - enableReadyCheck: false (required by Upstash serverless Redis)
 * - TLS options when using rediss:// or *.upstash.io
 */
export function getRedisOptions(custom?: Partial<RedisOptions>): RedisOptions {
  const url = getRedisUrl();
  const isTls = url.startsWith('rediss://') || url.includes('upstash.io');

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    retryStrategy: (times: number) => {
      // Exponential backoff capped at 3000ms
      return Math.min(times * 100, 3000);
    },
    ...custom,
  };
}

/**
 * Creates a new Redis instance with BullMQ and Upstash compatibility.
 */
export function createRedisClient(custom?: Partial<RedisOptions>): Redis {
  const url = getRedisUrl();
  const options = getRedisOptions(custom);
  return new Redis(url, options);
}

// Shared client for light read/write/ping checks if needed
let sharedClient: Redis | null = null;
export function getSharedRedisClient(): Redis {
  if (!sharedClient) {
    sharedClient = createRedisClient();
  }
  return sharedClient;
}
