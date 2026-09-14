import 'dotenv/config';
import dns from 'node:dns';
import { Pool, PoolConfig } from 'pg';

// Prioritize IPv4 DNS lookups in Node.js to prevent dual-stack socket races (ENETUNREACH / ETIMEDOUT AggregateError)
// when connecting to cloud-hosted databases like Neon on networks without IPv6 default routes.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const rawConnectionString = process.env.DATABASE_URL || 'postgresql://ballast:ballast_dev_password@localhost:5438/ballast_dev';
// Strip channel_binding=require which node-pg does not support and can cause unexpected socket drops
let connectionString = rawConnectionString.replace(/([?&])channel_binding=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
// Enable uselibpqcompat for pg-connection-string to silence deprecation warnings on sslmode=require
if (connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const requiresSsl =
  !isLocalhost ||
  connectionString.includes('sslmode=require') ||
  connectionString.includes('neon.tech') ||
  connectionString.includes('render.com') ||
  connectionString.includes('ssl=true');

const poolConfig: PoolConfig = {
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
};

// Global pool singleton for Next.js hot reload environments
declare global {
  // eslint-disable-next-line no-var
  var __ballast_pg_pool__: Pool | undefined;
}

export const pool: Pool = global.__ballast_pg_pool__ || new Pool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
  global.__ballast_pg_pool__ = pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  let res;
  try {
    res = await pool.query(text, params);
  } catch (err: any) {
    // Retry once if this is a transient connection error (e.g. Neon cold-start wake up, timeout, or socket drop)
    const isTransient =
      err?.code === 'ETIMEDOUT' ||
      err?.code === 'ECONNRESET' ||
      err?.code === '57P01' ||
      err?.name === 'AggregateError' ||
      (typeof err?.message === 'string' && err.message.includes('timeout'));

    if (isTransient) {
      console.warn('[SQL] Transient database connection issue, retrying query once...', err.message || err.code);
      await new Promise((resolve) => setTimeout(resolve, 800));
      res = await pool.query(text, params);
    } else {
      throw err;
    }
  }

  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL) {
    console.log('[SQL]', { text, duration, rows: res.rowCount });
  }
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

