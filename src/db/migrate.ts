import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export async function migrate(): Promise<void> {
  console.log('Starting migration...');
  await waitForDb();

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ Migration executed successfully');

    // Verify all 14 tables exist
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = res.rows.map((r: any) => r.table_name);
    console.log(`✓ Tables in public schema (${tables.length}):`, tables.join(', '));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// If executed directly
if (process.argv[1] === __filename) {
  migrate()
    .then(() => {
      console.log('Migration complete.');
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration script failed:', err);
      pool.end();
      process.exit(1);
    });
}
