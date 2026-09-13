import 'dotenv/config';
import { Pool, PoolConfig } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://ballast:ballast_dev_password@localhost:5438/ballast_dev';

const poolConfig: PoolConfig = {
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: connectionString.includes('sslmode=require') || connectionString.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
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
  const res = await pool.query(text, params);
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
