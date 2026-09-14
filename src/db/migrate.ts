import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Unique 64-bit integer advisory lock key for Ballast database migrations
const MIGRATION_ADVISORY_LOCK_ID = '7483920194';

export async function waitForDb(maxRetries = 20, delayMs = 1500): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('✓ Database connection established');
      return;
    } catch (err: any) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${err.message}`);
      }
      console.log(`Waiting for database (attempt ${attempt}/${maxRetries}): ${err.message}...`);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

export async function migrate(): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  console.log('Starting versioned database migrations...');
  await waitForDb();

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const client = await pool.connect();

  try {
    // 1. Acquire PostgreSQL advisory lock to prevent concurrent migration races
    console.log('[Migrate] Acquiring advisory lock...');
    await client.query(`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_ID})`);
    console.log('[Migrate] Advisory lock acquired.');

    // 2. Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Fetch already applied migrations
    const recorded = await client.query<{ filename: string }>(
      'SELECT filename FROM _migrations ORDER BY id ASC'
    );
    const appliedSet = new Set(recorded.rows.map((r) => r.filename));
    const alreadyApplied = Array.from(appliedSet);

    // 4. Discover and sort migration files
    const allFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = allFiles.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log(`✓ Database is already up to date. (${alreadyApplied.length} migrations recorded)`);
      return { applied: [], alreadyApplied };
    }

    console.log(`[Migrate] Found ${pending.length} pending migration(s) to apply:`);
    for (const f of pending) {
      console.log(`  -> ${f}`);
    }

    const appliedThisRun: string[] = [];

    // 5. Apply each pending migration in its own transaction
    for (const filename of pending) {
      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[Migrate] Applying: ${filename}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        appliedThisRun.push(filename);
        console.log(`✓ [Migrate] Successfully applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ [Migrate] Failed on migration ${filename}:`, err);
        throw err;
      }
    }

    // 6. Report total tables in public schema
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = res.rows.map((r: any) => r.table_name);
    console.log(`✓ All migrations complete. Tables in database (${tables.length}):`, tables.join(', '));

    return { applied: appliedThisRun, alreadyApplied };
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_ID})`);
      console.log('[Migrate] Advisory lock released.');
    } catch (unlockErr) {
      console.warn('[Migrate] Warning: Failed to release advisory lock:', unlockErr);
    }
    client.release();
  }
}

// If executed directly via CLI
if (process.argv[1] === __filename) {
  migrate()
    .then(() => {
      console.log('Migration execution finished.');
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal migration failure:', err);
      pool.end();
      process.exit(1);
    });
}
