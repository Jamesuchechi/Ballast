import { pool } from '../src/db/client';
import {
  SUPPORTED_TEMPLATE_TAGS,
  validateQuestionTemplate,
  renderQuestionTemplate,
  previewQuestionTemplate,
  runSchedule,
} from '../src/core/scheduler';

async function runTest() {
  console.log('=== Ballast M5: Schedule Question Template Validation Test Suite ===\n');

  try {
    // ----------------------------------------------------
    // Test 1: Supported Tags Definition
    // ----------------------------------------------------
    console.log('[Test 1] Verifying SUPPORTED_TEMPLATE_TAGS list...');
    const expectedTags = [
      'date',
      'today',
      'yesterday',
      'time',
      'datetime',
      'timestamp',
      'day_of_week',
      'weekday',
      'month',
      'year',
      'timezone',
    ];
    for (const tag of expectedTags) {
      if (!SUPPORTED_TEMPLATE_TAGS.includes(tag as any)) {
        throw new Error(`Expected tag '${tag}' to be in SUPPORTED_TEMPLATE_TAGS`);
      }
    }
    console.log('  Passed: All expected tags are present in SUPPORTED_TEMPLATE_TAGS.');

    // ----------------------------------------------------
    // Test 2: Valid Question Templates
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing validation with valid question templates...');
    const validTemplates = [
      'Plain question without any tags',
      'Weekly report for {{date}} at {{time}}',
      'Brief on {{today}} comparing against {{yesterday}} ({{timezone}})',
      'Executive update for {{weekday}}, {{month}} {{year}} (timestamp: {{timestamp}})',
      'Case-insensitive test with {{Date}} and {{TIMEZONE}} and {{Today}}',
      'Whitespace-tolerant test with {{  date  }} and {{   yesterday   }}',
    ];

    for (const t of validTemplates) {
      const result = validateQuestionTemplate(t);
      if (!result.valid || result.errors.length > 0) {
        throw new Error(`Expected valid template for: "${t}", got errors: ${result.errors.join(', ')}`);
      }
    }
    console.log(`  Passed: ${validTemplates.length} valid templates validated successfully.`);

    // ----------------------------------------------------
    // Test 3: Detecting Unrecognized and Typo Tags
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing validation with unrecognized/typo template tags...');
    const invalidTemplates = [
      {
        template: 'Brief for {{dat}} and {{tim}}',
        expectedUnrecognized: ['dat', 'tim'],
      },
      {
        template: 'Report for {{unknown_tag}}',
        expectedUnrecognized: ['unknown_tag'],
      },
      {
        template: 'Update for {{custom_var}} on {{date}}',
        expectedUnrecognized: ['custom_var'],
      },
    ];

    for (const item of invalidTemplates) {
      const result = validateQuestionTemplate(item.template);
      if (result.valid) {
        throw new Error(`Expected validation failure for: "${item.template}"`);
      }
      for (const expected of item.expectedUnrecognized) {
        if (!result.unrecognizedTags.includes(expected)) {
          throw new Error(
            `Expected unrecognized tag '${expected}' in result for: "${item.template}", got: ${result.unrecognizedTags.join(', ')}`
          );
        }
      }
      console.log(`  Correctly rejected: "${item.template}" -> Unrecognized: [${result.unrecognizedTags.join(', ')}]`);
    }
    console.log('  Passed: All typo/unrecognized tags were accurately detected.');

    // ----------------------------------------------------
    // Test 4: Empty & Malformed Syntax Handling
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing malformed syntax handling (empty tags, unclosed tags, empty strings)...');
    
    // Empty string
    const emptyRes = validateQuestionTemplate('');
    if (emptyRes.valid) throw new Error('Expected empty template to be invalid');

    // Empty tag {{}}
    const emptyTagRes = validateQuestionTemplate('Summary for {{}} today');
    if (emptyTagRes.valid) throw new Error('Expected empty tag {{}} to be invalid');

    // Unclosed tag {{
    const unclosedRes = validateQuestionTemplate('Summary for {{date and more');
    if (unclosedRes.valid) throw new Error('Expected unclosed tag to be invalid');

    console.log('  Passed: Malformed and empty syntax rejected cleanly.');

    // ----------------------------------------------------
    // Test 5: Live Template Preview Rendering
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing previewQuestionTemplate function...');
    const fixedDate = new Date('2026-09-17T14:30:00.000Z');
    const previewResult = previewQuestionTemplate(
      'Daily Brief for {{date}} at {{time}} ({{timezone}})',
      { date: fixedDate, timezone: 'Europe/London' }
    );

    if (!previewResult.validation.valid) {
      throw new Error(`Preview validation failed: ${previewResult.validation.errors.join(', ')}`);
    }
    if (!previewResult.rendered.includes('2026-09-17') || !previewResult.rendered.includes('Europe/London')) {
      throw new Error(`Preview render mismatch: got "${previewResult.rendered}"`);
    }
    console.log('  Rendered preview output:', previewResult.rendered);
    console.log('  Passed: Preview rendering returns both rendered string and validation state.');

    // ----------------------------------------------------
    // Test 6: Database Integration and runSchedule Validation
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing runSchedule enforcement on valid and invalid templates...');
    const dummyWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('M5 Test Workspace', 'operator')
      RETURNING id;
    `);
    const workspaceId = dummyWorkspace.rows[0].id;

    // 6a: Valid schedule run
    const validSchedRes = await pool.query<{ id: string }>(`
      INSERT INTO schedules (
        workspace_id, name, question_template, cron, timezone, mode, enabled
      ) VALUES (
        $1, 'Valid Template Schedule', 'Weekly Status for {{date}} on {{weekday}} ({{timezone}})', '0 9 * * 1', 'America/Chicago', 'home', true
      ) RETURNING id;
    `, [workspaceId]);
    const validSchedId = validSchedRes.rows[0].id;

    const runValid = await runSchedule(validSchedId);
    console.log('  Valid schedule run result question:', runValid.question);
    if (!runValid.question.includes('America/Chicago')) {
      throw new Error('Expected rendered prompt to contain timezone.');
    }

    // 6b: Invalid schedule run (simulate legacy or manually corrupted DB entry)
    const invalidSchedRes = await pool.query<{ id: string }>(`
      INSERT INTO schedules (
        workspace_id, name, question_template, cron, timezone, mode, enabled
      ) VALUES (
        $1, 'Invalid Template Schedule', 'Corrupted template for {{invalid_placeholder}}', '0 9 * * 1', 'UTC', 'home', true
      ) RETURNING id;
    `, [workspaceId]);
    const invalidSchedId = invalidSchedRes.rows[0].id;

    let caughtError = false;
    try {
      await runSchedule(invalidSchedId);
    } catch (err: any) {
      caughtError = true;
      if (!err.message.includes('Invalid question template')) {
        throw new Error(`Expected error message to mention invalid question template, got: ${err.message}`);
      }
      console.log('  Caught expected error during runSchedule on invalid template:', err.message);
    }

    if (!caughtError) {
      throw new Error('Expected runSchedule to throw error on invalid question template in DB');
    }

    // Cleanup workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All M5 question template validation and preview tests passed successfully!\n');
  } finally {
    try {
      const { closeBriefQueue } = await import('../src/queue/briefQueue');
      await closeBriefQueue();
    } catch {}
    await pool.end();
  }
}

runTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[FAIL] M5 test failed:', err);
  process.exit(1);
});
