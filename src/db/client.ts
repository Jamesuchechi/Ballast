import 'dotenv/config';
import fs from 'node:fs';
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

/**
 * Resolves PostgreSQL SSL configuration with strict TLS certificate verification (Security S3).
 * Supports standard trusted CAs, custom CA certs via DATABASE_CA_CERT/PGSSLROOTCERT,
 * and explicit dev opt-out via DB_SSL_REJECT_UNAUTHORIZED=false.
 */
export function getDatabaseSslConfig(): boolean | { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (!requiresSsl) {
    return undefined;
  }

  // Explicit opt-out for custom self-signed dev/testing environments
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    return { rejectUnauthorized: false };
  }

  // If a custom CA certificate is provided via environment variable (raw PEM string or path)
  const caCert = process.env.DATABASE_CA_CERT || process.env.PGSSLROOTCERT;
  if (caCert) {
    let caContent = caCert;
    if (fs.existsSync(caCert)) {
      try {
        caContent = fs.readFileSync(caCert, 'utf8');
      } catch {}
    }
    return {
      rejectUnauthorized: true,
      ca: caContent,
    };
  }

  // In production or standard cloud environments, enforce TLS certificate verification
  return { rejectUnauthorized: true };
}

const poolConfig: PoolConfig = {
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: getDatabaseSslConfig(),
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

export type TransactionClient = import('pg').PoolClient;

/**
 * Executes a callback within an isolated, atomic PostgreSQL transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK on error, and client release.
 */
export async function withTransaction<T>(
  callback: (client: TransactionClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[SQL] Error during rollback:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}


