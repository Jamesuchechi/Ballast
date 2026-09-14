import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { query, queryOne } from '../src/db/client';
import { runCritic, evaluateCriticDeterministicForEval } from '../src/core/critic';
import { executeAction } from '../src/core/actionExecutor';
import { githubConnector } from '../src/connectors/github';
import { calendarConnector } from '../src/connectors/calendar';
import { renderBriefMarkdown } from '../src/core/renderer';
import { validateForPublish } from '../src/core/validator';
import type { CriticInput, RetrievedQuote, DraftBrief, PublishedBriefSections } from '../src/core/types';

async function runPhase6TestSuite() {
  console.log('================================================================');
  console.log('  Ballast Phase 6: GitHub + Calendar + Cross-Source Conflicts   ');
  console.log('================================================================\n');

  const testWsId = 'b6000000-0000-0000-0000-000000000001';
  const testBriefId = 'b6000000-0000-0000-0000-000000000002';
  const testUserId = 'b6000000-0000-0000-0000-000000000003';

  try {
    // -------------------------------------------------------------------------
    // Setup DB baseline fixtures
    // -------------------------------------------------------------------------
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'phase6@ballast.local', 'hash_test', 'Phase 6 User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES ($1, 'Phase 6 Test Workspace', 'operator')
       ON CONFLICT (id) DO UPDATE SET plan = 'operator'`,
      [testWsId]
    );

    await query(
      `INSERT INTO briefs (id, workspace_id, question, status, markdown)
       VALUES ($1, $2, 'When is the Stripe auto-debit deployment scheduled?', 'published', '# Initial')
       ON CONFLICT (id) DO NOTHING`,
      [testBriefId, testWsId]
    );

    // Insert sources fixtures for Gmail, GitHub, and Calendar
    const sourceGmailId = 'c6000000-0000-0000-0000-000000000101';
    const sourceGitHubId = 'c6000000-0000-0000-0000-000000000202';
    const sourceCalendarId = 'c6000000-0000-0000-0000-000000000303';

    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum)
       VALUES 
        ($1, $4, 'gmail', 'thread-101', 'chk-gmail-1'),
        ($2, $4, 'github', 'repo#42', 'chk-github-2'),
        ($3, $4, 'calendar', 'cal-event-303', 'chk-cal-3')
       ON CONFLICT (id) DO NOTHING`,
      [sourceGmailId, sourceGitHubId, sourceCalendarId, testWsId]
    );

    // =========================================================================
    // Part 1: Calendar Read-Only Guard (FR5.4) & Connector Interface Verification
    // =========================================================================
    console.log('[Test 1] Verifying Calendar Read-Only sync guarantees (FR5.4)...');
    assert.equal(calendarConnector.id, 'calendar');
    assert.equal(calendarConnector.name, 'Google Calendar');
    // Calendar connector must not expose any write / event-create methods
    assert.equal((calendarConnector as any).createEvent, undefined, 'Calendar connector must NOT expose createEvent in v1');
    assert.equal((calendarConnector as any).send, undefined, 'Calendar connector must NOT expose send');
    assert.equal((calendarConnector as any).write, undefined, 'Calendar connector must NOT expose write methods');
    console.log('✓ Verified: Calendar connector is strictly read-only per FR5.4.');

    console.log('\n[Test 2] Verifying GitHub connector contract and sync structure...');
    assert.equal(githubConnector.id, 'github');
    assert.equal(githubConnector.name, 'GitHub');
    assert.equal(typeof githubConnector.list_changes, 'function');
    assert.equal(typeof githubConnector.fetch, 'function');
    assert.equal(typeof githubConnector.revoke, 'function');
    console.log('✓ Verified: GitHub connector adheres strictly to the Connector interface.');

    // =========================================================================
    // Part 2: Cross-Source Conflict Detection Across Gmail, GitHub, Calendar (FR4.5)
    // =========================================================================
    console.log('\n[Test 3] Testing Cross-Source Conflict Detection (Inbox vs Repo vs Calendar)...');

    const quoteGmail: RetrievedQuote = {
      id: 'quote-gmail-001',
      source_id: sourceGmailId,
      source_class: 'private',
      connector: 'gmail',
      quote: 'According to our sync call, the Stripe auto-debit deployment is confirmed on schedule for October 15.',
    };

    const quoteGitHub: RetrievedQuote = {
      id: 'quote-gh-002',
      source_id: sourceGitHubId,
      source_class: 'private',
      connector: 'github',
      quote: 'PR #42 status: Deployment delayed to November 12 pending legal consent audit and PCI compliance review.',
    };

    const quoteCalendar: RetrievedQuote = {
      id: 'quote-cal-003',
      source_id: sourceCalendarId,
      source_class: 'private',
      connector: 'calendar',
      quote: 'Calendar event: Stripe deployment review meeting rescheduled to October 22.',
    };

    const criticInput: CriticInput = {
      question: 'When is the Stripe auto-debit deployment scheduled?',
      mode: 'home',
      retrieved: [quoteGmail, quoteGitHub, quoteCalendar],
      draft_brief: {
        title: 'Brief: Stripe Deployment Schedule',
        sections: {
          answer: 'The deployment is confirmed on schedule for October 15.',
          what_i_used: {
            private: [quoteGmail.source_id, quoteGitHub.source_id, quoteCalendar.source_id],
            web: [],
            unchecked: [],
          },
          evidence: [
            {
              claim: 'Stripe auto-debit deployment is confirmed on schedule for October 15.',
              citation_ids: [quoteGmail.id],
            },
            {
              claim: 'Deployment delayed to November 12 pending legal consent audit.',
              citation_ids: [quoteGitHub.id],
            },
          ],
          uncertain: [],
          open_loops: [],
          actions: [],
          what_i_did_not_do: [],
        },
      },
      unchecked: [],
    };

    // Run critic evaluation
    process.env.EVAL_USE_MOCK = 'true';
    const criticOut = evaluateCriticDeterministicForEval(criticInput);

    // Assert that conflicts were detected across the sources
    assert.ok(criticOut.conflicts.length > 0, 'Critic must detect cross-source conflicts');
    console.log(`✓ Critic detected ${criticOut.conflicts.length} cross-source conflict(s):`);
    for (const conf of criticOut.conflicts) {
      console.log(`    - Topic: "${conf.topic}" (Citations: ${conf.citation_ids.join(', ')})`);
      assert.ok(conf.citation_ids.length >= 2, 'Conflict must cite at least two conflicting sources');
    }

    // Verify conflict involves the opposing quotes
    const conflictCitationIds = criticOut.conflicts.flatMap((c) => c.citation_ids);
    assert.ok(
      conflictCitationIds.includes(quoteGmail.id) && conflictCitationIds.includes(quoteGitHub.id),
      'Conflict must identify disagreement between Gmail and GitHub quotes'
    );

    // =========================================================================
    // Part 3: Published Brief Rendering with Conflict Citations (Exit Criterion)
    // =========================================================================
    console.log('\n[Test 4] Testing Published Brief citation persistence & neutral Answer...');

    // Simulate pipeline synthesis for conflict brief
    const evidenceItems = criticOut.keep.map((k) => ({
      claim: k.claim,
      citations: k.citation_ids.map((cid) => {
        const q = [quoteGmail, quoteGitHub, quoteCalendar].find((quote) => quote.id === cid)!;
        return {
          source_id: q.source_id,
          source_class: q.source_class,
          citation_type: 'support' as const,
          quote: q.quote,
          url: null,
        };
      }),
    }));

    const uncertainList: string[] = [
      ...criticInput.draft_brief.sections.uncertain,
      ...criticOut.conflicts.map((c) => `Conflict detected: ${c.topic} between cited sources.`),
    ];

    const didNotList: string[] = [
      ...criticOut.did_not,
      'Did not arbitrarily resolve cross-source disagreements or silently pick a winner.',
    ];

    let answerText = criticOut.keep.map((k) => `- ${k.claim}`).join('\n');
    if (criticOut.conflicts.length > 0) {
      answerText += '\n\n*Note: Discrepancy detected across cited sources. Disagreements are detailed in the Uncertain section and citations rather than arbitrarily selecting a winner.*';
    }

    const publishedSections: PublishedBriefSections = {
      answer: answerText,
      what_i_used: {
        private: [quoteGmail.source_id, quoteGitHub.source_id, quoteCalendar.source_id],
        web: [],
        unchecked: [],
      },
      evidence: evidenceItems,
      uncertain: uncertainList,
      open_loops: [],
      actions: [],
      what_i_did_not_do: didNotList,
    };

    const rendered = renderBriefMarkdown({
      title: 'Brief: Stripe Deployment Schedule',
      as_of: new Date().toISOString(),
      mode: 'home',
      status: 'published',
      sections: publishedSections,
    });

    // Check markdown content
    assert.match(rendered.markdown, /## Uncertain/, 'Rendered markdown must have Uncertain section');
    assert.match(rendered.markdown, /Conflict detected:/i, 'Rendered markdown must surface the conflict');
    assert.match(rendered.markdown, /Discrepancy regarding/i, 'Rendered markdown must describe the discrepancy');
    assert.match(rendered.markdown, /Did not arbitrarily resolve cross-source disagreements/i, 'What I did not do must state non-arbitration');

    // Persist citations to DB with citation_type = 'conflict'
    await query(`DELETE FROM citations WHERE brief_id = $1`, [testBriefId]);
    for (const c of criticOut.conflicts) {
      for (const citId of c.citation_ids) {
        const q = [quoteGmail, quoteGitHub, quoteCalendar].find((quote) => quote.id === citId);
        if (q) {
          await query(
            `INSERT INTO citations (
               workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote, url
             ) VALUES ($1, $2, $3, $4, 'conflict', $5, $6, $7)`,
            [
              testWsId,
              testBriefId,
              q.source_id,
              q.source_class,
              JSON.stringify({ start: 0, end: 0 }),
              q.quote,
              null,
            ]
          );
        }
      }
    }

    // Verify persisted conflict citations in database
    const conflictRows = await query<any>(
      `SELECT * FROM citations WHERE brief_id = $1 AND citation_type = 'conflict'`,
      [testBriefId]
    );
    assert.ok(conflictRows.length >= 2, 'Database must have at least 2 citations with citation_type = conflict');
    console.log(`✓ Verified: Persisted ${conflictRows.length} 'conflict' citations in database without picking a winner.`);

    // =========================================================================
    // Part 4: GitHub Action Draft Execution & Strict Approval Gate (FR5)
    // =========================================================================
    console.log('\n[Test 5] Testing GitHub issue_draft execution safety...');

    const issueActionId = 'a6000000-0000-0000-0000-000000000001';
    await query(
      `INSERT INTO actions (id, workspace_id, brief_id, type, payload, approved_at, executed_at, error)
       VALUES ($1, $2, $3, 'issue_draft', $4, NULL, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET approved_at = NULL, executed_at = NULL, error = NULL`,
      [
        issueActionId,
        testWsId,
        testBriefId,
        JSON.stringify({
          repo: 'acme/backend',
          title: 'Resolve Stripe Deployment Conflict (Oct 15 vs Nov 12)',
          body: 'Cross-source conflict detected between Gmail thread and PR #42. Align stakeholders before freeze.',
        }),
      ]
    );

    let dispatchedIssue: any = null;
    const mockIssueDispatch = async (params: any) => {
      dispatchedIssue = params;
      return { id: 456, url: `https://github.com/${params.repo}/issues/456` };
    };

    // Subtest A: Unapproved draft must NEVER post
    let didThrowUnapproved = false;
    try {
      await executeAction(issueActionId, { customGitHubDispatch: mockIssueDispatch });
    } catch (err: any) {
      didThrowUnapproved = true;
      assert.match(err.message, /not approved/i);
    }
    assert.ok(didThrowUnapproved, 'Unapproved GitHub issue draft must throw');
    assert.equal(dispatchedIssue as any, null, 'GitHub dispatch must NOT be called for unapproved draft');
    console.log('✓ Verified: Unapproved GitHub issue_draft rejected before dispatch.');

    // Subtest B: Entitlement Check: Free/Pro plan cannot execute external writes
    await query(`UPDATE workspaces SET plan = 'free' WHERE id = $1`, [testWsId]);
    await query(`UPDATE actions SET approved_at = NOW(), approved_by = $1 WHERE id = $2`, [testUserId, issueActionId]);

    let didThrowEntitlement = false;
    try {
      await executeAction(issueActionId, { customGitHubDispatch: mockIssueDispatch });
    } catch (err: any) {
      didThrowEntitlement = true;
      assert.match(err.message, /Operator plan required/i);
    }
    assert.ok(didThrowEntitlement, 'Free plan must be rejected with entitlement error');
    assert.equal(dispatchedIssue as any, null, 'Dispatch must not be called on Free plan');
    console.log('✓ Verified: Free workspace rejected with 403 entitlement error.');

    // Subtest C: Approved draft on Operator plan succeeds and writes audit log
    await query(`UPDATE workspaces SET plan = 'operator' WHERE id = $1`, [testWsId]);
    const executedIssue = await executeAction(issueActionId, { customGitHubDispatch: mockIssueDispatch });

    assert.ok(executedIssue.executed_at, 'Action must be stamped with executed_at');
    assert.equal(executedIssue.error, null, 'Error must be null on success');
    const recordedIssue: any = dispatchedIssue;
    assert.ok(recordedIssue, 'Mock dispatch must have been called');
    assert.equal(recordedIssue.repo, 'acme/backend');
    assert.equal(recordedIssue.title, 'Resolve Stripe Deployment Conflict (Oct 15 vs Nov 12)');

    // Check access_logs
    const issueLogs = await query<any>(
      `SELECT * FROM access_logs 
       WHERE workspace_id = $1 AND brief_id = $2 AND action LIKE 'github.issue_draft%'
       ORDER BY created_at DESC LIMIT 1`,
      [testWsId, testBriefId]
    );
    assert.ok(issueLogs.length > 0, 'Access log entry must be created for github.issue_draft');
    console.log('✓ Verified: Approved GitHub issue_draft executed with audit log in access_logs.');

    // =========================================================================
    // Part 5: GitHub comment_draft execution
    // =========================================================================
    console.log('\n[Test 6] Testing GitHub comment_draft execution safety...');

    const commentActionId = 'a6000000-0000-0000-0000-000000000002';
    await query(
      `INSERT INTO actions (id, workspace_id, brief_id, type, payload, approved_at, executed_at, error)
       VALUES ($1, $2, $3, 'comment_draft', $4, NULL, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET approved_at = NULL, executed_at = NULL, error = NULL`,
      [
        commentActionId,
        testWsId,
        testBriefId,
        JSON.stringify({
          repo: 'acme/backend',
          issue_number: 42,
          body: 'Note from Ballast Brief: Conflict surfaced between October 15 email and this PR.',
        }),
      ]
    );

    let dispatchedComment: any = null;
    const mockCommentDispatch = async (params: any) => {
      dispatchedComment = params;
      return { id: 789, url: `https://github.com/${params.repo}/issues/42#issuecomment-789` };
    };

    // Subtest A: Unapproved comment draft must throw
    let didThrowUnapprovedComment = false;
    try {
      await executeAction(commentActionId, { customGitHubDispatch: mockCommentDispatch });
    } catch (err: any) {
      didThrowUnapprovedComment = true;
      assert.match(err.message, /not approved/i);
    }
    assert.ok(didThrowUnapprovedComment, 'Unapproved comment draft must throw');
    assert.equal(dispatchedComment as any, null);

    // Subtest B: Approved comment draft executes
    await query(`UPDATE actions SET approved_at = NOW(), approved_by = $1 WHERE id = $2`, [testUserId, commentActionId]);
    const executedComment = await executeAction(commentActionId, { customGitHubDispatch: mockCommentDispatch });

    assert.ok(executedComment.executed_at, 'Comment draft must be stamped with executed_at');
    assert.equal(executedComment.error, null);
    const recordedComment: any = dispatchedComment;
    assert.ok(recordedComment);
    assert.equal(recordedComment.repo, 'acme/backend');
    assert.equal(recordedComment.issueNumber, 42);

    const commentLogs = await query<any>(
      `SELECT * FROM access_logs 
       WHERE workspace_id = $1 AND brief_id = $2 AND action LIKE 'github.comment_draft%'
       ORDER BY created_at DESC LIMIT 1`,
      [testWsId, testBriefId]
    );
    assert.ok(commentLogs.length > 0, 'Access log entry must be created for github.comment_draft');
    console.log('✓ Verified: Approved GitHub comment_draft executed with audit log in access_logs.');

    console.log('\n================================================================');
    console.log('  ALL PHASE 6 TESTS PASSED PROVABLY (Production Quality)        ');
    console.log('================================================================\n');
  } finally {
    // Cleanup fixtures
    await query(`DELETE FROM actions WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM citations WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM briefs WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [testWsId]);
    await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  }
}

runPhase6TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Phase 6 Test Suite Failed:', err);
    process.exit(1);
  });
