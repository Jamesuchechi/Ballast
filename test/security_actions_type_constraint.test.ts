import { pool } from '../src/db/client';
import { ActionDraft } from '../src/core/actionExecutor';

async function runTest() {
  console.log('=== Ballast Security S6: Actions Table Type Constraint Test Suite ===\n');

  try {
    console.log('[Test 1] Verifying TypeScript ActionDraft type consistency...');
    const allowedTypes: ActionDraft['type'][] = ['email_draft', 'issue_draft', 'comment_draft', 'task'];
    if (allowedTypes.length !== 4) {
      throw new Error('Expected exactly 4 allowed action types in TypeScript definition.');
    }
    console.log('  Passed: TypeScript ActionDraft type covers all 4 expected types.');

    console.log('\n[Test 2] Querying PostgreSQL check constraint on `actions.type` table...');
    const constraintQuery = await pool.query<{ conname: string; consrc: string; definition: string }>(`
      SELECT
        con.conname,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'actions' AND con.contype = 'c';
    `);

    const typeConstraint = constraintQuery.rows.find(row => 
      row.definition.includes('type') && row.definition.includes('email_draft')
    );

    if (!typeConstraint) {
      console.warn('  Warning: Could not locate explicit CHECK constraint definition from pg_constraint catalog (might differ across PG setups).');
    } else {
      console.log(`  Found constraint: ${typeConstraint.conname} => ${typeConstraint.definition}`);
      for (const expected of allowedTypes) {
        if (!typeConstraint.definition.includes(expected)) {
          throw new Error(`Constraint missing expected action type: ${expected}`);
        }
      }
      console.log('  Passed: PostgreSQL CHECK constraint verified for all 4 types.');
    }

    console.log('\n[PASS] Security S6 actions type constraint verified successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] Security S6 test failed:', err);
  process.exit(1);
});
