import { pool } from '../src/db/client';
import * as fs from 'fs';
import * as path from 'path';

async function syncDatabase() {
  console.log('=== Syncing Production Database with All Migrations & Schema ===\n');

  const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`Discovered ${files.length} migration files in src/db/migrations:`);
  for (const file of files) {
    console.log(`  - ${file}`);
  }

  console.log('\nApplying each migration sequentially...');
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      console.log(`--> Executing ${file}...`);
      await pool.query(sql);
      console.log(`    ✓ ${file} applied successfully.`);
    } catch (err: any) {
      console.error(`    ✗ Error applying ${file}:`, err.message);
      throw err;
    }
  }

  // Also apply schema.sql IF NOT EXISTS statements to guarantee full sync
  console.log('\n--> Applying master schema.sql definitions...');
  const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
  await pool.query(schemaSql);
  console.log('    ✓ master schema.sql synced successfully.');

  // Validate all key tables, columns, and indexes
  console.log('\nValidating database schema state...');
  const tables = await pool.query<{ table_name: string }>(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Public tables in database:', tables.rows.map(r => r.table_name).join(', '));

  const indexes = await pool.query<{ tablename: string; indexname: string }>(`
    SELECT tablename, indexname 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    ORDER BY tablename, indexname;
  `);
  console.log(`Total active indexes: ${indexes.rowCount}`);

  console.log('\n[SUCCESS] Production Database fully synced with all migrations & schema definitions!\n');
  await pool.end();
}

syncDatabase().catch(err => {
  console.error('[FAIL] Database sync failed:', err);
  process.exit(1);
});
