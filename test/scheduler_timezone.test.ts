import { pool } from '../src/db/client';
import { formatInTimezone, renderQuestionTemplate, runSchedule } from '../src/core/scheduler';
import { CronExpressionParser } from 'cron-parser';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  console.log('=== Ballast D9: Timezone-Aware Cron Scheduler Test Suite ===\n');

  try {
    console.log('[Test 1] Applying migration 011_add_timezone_to_schedules.sql...');
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/db/migrations/011_add_timezone_to_schedules.sql'),
      'utf8'
    );
    await pool.query(migrationSql);
    console.log('  Passed: Migration executed successfully.');

    console.log('\n[Test 2] Testing formatInTimezone across different timezones on date boundaries...');
    // UTC time: 2026-09-17 01:30:00 UTC (In Tokyo it is 2026-09-17 10:30; in New York it is 2026-09-16 21:30)
    const fixedDate = new Date('2026-09-17T01:30:00.000Z');

    const tokyoFmt = formatInTimezone(fixedDate, 'Asia/Tokyo');
    console.log('  Tokyo Formatted:', tokyoFmt);
    if (tokyoFmt.date !== '2026-09-17' || tokyoFmt.time !== '10:30') {
      throw new Error(`Tokyo format mismatch: expected date 2026-09-17 10:30, got ${tokyoFmt.date} ${tokyoFmt.time}`);
    }

    const nyFmt = formatInTimezone(fixedDate, 'America/New_York');
    console.log('  New York Formatted:', nyFmt);
    if (nyFmt.date !== '2026-09-16' || nyFmt.time !== '21:30' || nyFmt.yesterday !== '2026-09-15') {
      throw new Error(`New York format mismatch: expected date 2026-09-16 21:30, got ${nyFmt.date} ${nyFmt.time}`);
    }
    console.log('  Passed: formatInTimezone accurately reflects local dates on boundary transitions.');

    console.log('\n[Test 3] Testing renderQuestionTemplate with all supported tags...');
    const template =
      'Brief for {{date}} (yesterday: {{yesterday}}, weekday: {{weekday}}, time: {{time}}, tz: {{timezone}})';
    const renderedTokyo = renderQuestionTemplate(template, {
      date: fixedDate,
      timezone: 'Asia/Tokyo',
    });
    console.log('  Rendered Tokyo:', renderedTokyo);
    if (!renderedTokyo.includes('2026-09-17') || !renderedTokyo.includes('10:30') || !renderedTokyo.includes('Asia/Tokyo')) {
      throw new Error('Template rendering failed for Tokyo.');
    }

    const renderedNY = renderQuestionTemplate(template, {
      date: fixedDate,
      timezone: 'America/New_York',
    });
    console.log('  Rendered NY:', renderedNY);
    if (!renderedNY.includes('2026-09-16') || !renderedNY.includes('21:30') || !renderedNY.includes('America/New_York')) {
      throw new Error('Template rendering failed for NY.');
    }
    console.log('  Passed: renderQuestionTemplate resolves all tags according to target timezone.');

    console.log('\n[Test 4] Testing CronExpressionParser with explicit timezone option...');
    // "0 9 * * *" = 9:00 AM
    const cronExpr = '0 9 * * *';
    const intervalNY = CronExpressionParser.parse(cronExpr, { currentDate: fixedDate, tz: 'America/New_York' });
    const nextNY = intervalNY.next().toDate();
    console.log('  Next 9 AM in America/New_York (UTC timestamp):', nextNY.toISOString());

    const intervalTokyo = CronExpressionParser.parse(cronExpr, { currentDate: fixedDate, tz: 'Asia/Tokyo' });
    const nextTokyo = intervalTokyo.next().toDate();
    console.log('  Next 9 AM in Asia/Tokyo (UTC timestamp):', nextTokyo.toISOString());

    if (nextNY.getTime() === nextTokyo.getTime()) {
      throw new Error('Next execution time in NY and Tokyo should differ based on timezone.');
    }
    console.log('  Passed: CronExpressionParser correctly calculates due times per timezone.');

    console.log('\n[Test 5] Testing schedule database insertion and runSchedule with timezone...');
    const dummyWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('D9 Test Workspace', 'operator')
      RETURNING id;
    `);
    const workspaceId = dummyWorkspace.rows[0].id;

    const schedRes = await pool.query<{ id: string }>(`
      INSERT INTO schedules (
        workspace_id, name, question_template, cron, timezone, mode, enabled
      ) VALUES (
        $1, 'Daily Morning Brief', 'Executive Summary for {{date}} at {{time}} ({{timezone}})', '0 9 * * *', 'America/Los_Angeles', 'home', true
      ) RETURNING id;
    `, [workspaceId]);
    const scheduleId = schedRes.rows[0].id;

    const runRes = await runSchedule(scheduleId);
    console.log('  Schedule Run Result:', runRes);
    if (!runRes.question.includes('America/Los_Angeles')) {
      throw new Error('Expected generated brief question to resolve Los Angeles timezone.');
    }

    const briefRow = await pool.query<{ id: string; question: string }>(
      `SELECT id, question FROM briefs WHERE id = $1`,
      [runRes.briefId]
    );
    console.log('  Stored Brief Question in DB:', briefRow.rows[0].question);
    if (!briefRow.rows[0].question.includes('America/Los_Angeles')) {
      throw new Error('Stored brief question does not contain rendered timezone.');
    }
    console.log('  Passed: runSchedule persisted brief with timezone-rendered prompt.');

    // Cleanup workspace
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All D9 timezone-aware scheduler tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] D9 test failed:', err);
  process.exit(1);
});
