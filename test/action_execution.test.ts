import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { query, queryOne, pool } from '../src/db/client';
import { executeAction, buildRfc2822Message } from '../src/core/actionExecutor';

async function runActionExecutionTests() {
  console.log('=== Ballast Action Execution & Human-in-the-Loop Safety Suite ===\n');

  // Setup test fixtures in DB
  const testWsId = 'b0000000-0000-0000-0000-000000000001';
  const testBriefId = 'b0000000-0000-0000-0000-000000000002';
  const testUserId = 'b0000000-0000-0000-0000-000000000003';

  try {
    // 1. Ensure test user & workspace exist
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'operator@ballast.local', 'hash_test', 'Operator User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES ($1, 'Test Action Workspace', 'free')
       ON CONFLICT (id) DO UPDATE SET plan = 'free'`,
      [testWsId]
    );

    await query(
      `INSERT INTO briefs (id, workspace_id, question, status, markdown)
       VALUES ($1, $2, 'Follow up with stakeholders?', 'published', '# Brief')
       ON CONFLICT (id) DO NOTHING`,
      [testBriefId, testWsId]
    );

    // =========================================================================
    // Test 1: Unapproved draft NEVER calls send (TODO.md Phase 5 core exit test)
    // =========================================================================
    console.log('[Test 1] Testing that unapproved draft NEVER calls external provider...');
    const action1Id = 'a1111111-1111-1111-1111-111111111111';
    await query(
      `INSERT INTO actions (id, workspace_id, brief_id, type, payload, approved_at, executed_at, error)
       VALUES ($1, $2, $3, 'email_draft', $4, NULL, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET approved_at = NULL, executed_at = NULL, error = NULL`,
      [
        action1Id,
        testWsId,
        testBriefId,
        JSON.stringify({
          to: 'client@example.com',
          subject: 'Unapproved Follow-up',
          body: 'This must never be sent.',
        }),
      ]
    );

    let providerCalled = false;
    const mockSend = async () => {
      providerCalled = true;
      return { messageId: 'msg-should-never-exist' };
    };

    let didThrowUnapproved = false;
    try {
      await executeAction(action1Id, { customGmailSend: mockSend });
    } catch (err: any) {
      didThrowUnapproved = true;
      assert.match(
        err.message,
        /cannot be executed: not approved/i,
        'Expected error message indicating action is not approved'
      );
    }

    assert.ok(didThrowUnapproved, 'executeAction must reject unapproved actions');
    assert.equal(providerCalled, false, 'CRITICAL VIOLATION: Provider was called for unapproved draft!');
    console.log('✓ Verified: Unapproved action draft rejected without calling send.');

    // =========================================================================
    // Test 2: Free & Pro plans cannot execute external actions (403 / entitlement)
    // =========================================================================
    console.log('\n[Test 2] Testing workspace entitlement gate (Free/Pro plans prohibited)...');
    // Approve the action, but leave workspace plan as 'free'
    await query(
      `UPDATE actions SET approved_at = NOW(), approved_by = $1 WHERE id = $2`,
      [testUserId, action1Id]
    );

    let didThrowEntitlement = false;
    providerCalled = false;

    try {
      await executeAction(action1Id, { customGmailSend: mockSend });
    } catch (err: any) {
      didThrowEntitlement = true;
      assert.match(
        err.message,
        /Operator plan required/i,
        'Expected error message indicating Operator plan is required'
      );
    }

    assert.ok(didThrowEntitlement, 'executeAction must reject non-operator workspaces');
    assert.equal(providerCalled, false, 'CRITICAL VIOLATION: Free plan action called external provider!');

    // Verify error was recorded in actions table
    const freePlanAction = await queryOne<{ error: string }>(
      `SELECT error FROM actions WHERE id = $1`,
      [action1Id]
    );
    assert.ok(freePlanAction?.error?.includes('Operator plan required'));
    console.log('✓ Verified: Free/Pro plan entitlement gate enforced before provider call.');

    // =========================================================================
    // Test 3: Approved draft on Operator plan successfully executes and audits
    // =========================================================================
    console.log('\n[Test 3] Testing execution of approved draft on Operator workspace...');
    // Upgrade workspace to operator
    await query(`UPDATE workspaces SET plan = 'operator' WHERE id = $1`, [testWsId]);

    let capturedPayload: any = null;
    const successfulMockSend = async (params: any) => {
      providerCalled = true;
      capturedPayload = params;
      return { messageId: 'gmail_msg_12345' };
    };

    const executed = await executeAction(action1Id, { customGmailSend: successfulMockSend });

    assert.ok(providerCalled, 'Provider must be called for approved action on Operator plan');
    assert.equal(capturedPayload?.to, 'client@example.com');
    assert.equal(capturedPayload?.subject, 'Unapproved Follow-up');
    assert.ok(capturedPayload?.rawMessage, 'Raw RFC 2822 message must be built');
    assert.ok(executed.executed_at, 'executed_at timestamp must be set');
    assert.equal(executed.error, null, 'error column must be cleared');

    // Verify access_logs record
    const accessLog = await queryOne<{ action: string }>(
      `SELECT action FROM access_logs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [testWsId]
    );
    assert.ok(accessLog?.action.includes('gmail'), 'Access log must record gmail execution');
    console.log('✓ Verified: Approved Operator draft dispatched with access_log audit entry.');

    // =========================================================================
    // Test 4: Idempotency (already executed action does not re-send)
    // =========================================================================
    console.log('\n[Test 4] Testing idempotency of executed actions...');
    providerCalled = false;
    const reExecuted = await executeAction(action1Id, { customGmailSend: mockSend });
    assert.equal(providerCalled, false, 'Provider must NOT be called again for already executed action');
    assert.equal(reExecuted.id, action1Id);
    console.log('✓ Verified: Already executed action is idempotent and does not re-send.');

    // =========================================================================
    // Test 5: Provider failure captures error and leaves executed_at null
    // =========================================================================
    console.log('\n[Test 5] Testing provider failure handling and error persistence...');
    const action2Id = 'a2222222-2222-2222-2222-222222222222';
    await query(
      `INSERT INTO actions (id, workspace_id, brief_id, type, payload, approved_at, executed_at, error)
       VALUES ($1, $2, $3, 'email_draft', $4, NOW(), NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET approved_at = NOW(), executed_at = NULL, error = NULL`,
      [
        action2Id,
        testWsId,
        testBriefId,
        JSON.stringify({
          to: 'partner@example.com',
          subject: 'Provider Failure Test',
          body: 'Simulate API rate limit or network timeout',
        }),
      ]
    );

    const failingMockSend = async () => {
      throw new Error('Google Gmail API 429: Rate limit exceeded');
    };

    let didThrowProviderError = false;
    try {
      await executeAction(action2Id, { customGmailSend: failingMockSend });
    } catch (err: any) {
      didThrowProviderError = true;
      assert.match(err.message, /Rate limit exceeded/i);
    }

    assert.ok(didThrowProviderError, 'executeAction must propagate provider errors');
    const failedAction = await queryOne<{ executed_at: string | null; error: string | null }>(
      `SELECT executed_at, error FROM actions WHERE id = $1`,
      [action2Id]
    );
    assert.equal(failedAction?.executed_at, null, 'executed_at must remain NULL when send fails');
    assert.ok(failedAction?.error?.includes('Rate limit exceeded'), 'error column must record provider error');
    console.log('✓ Verified: Provider failure recorded in database without marking executed.');

    // =========================================================================
    // Test 6: In-app tasks execute in-app without external API calls
    // =========================================================================
    console.log('\n[Test 6] Testing in-app task execution (stays in-app)...');
    const action3Id = 'a3333333-3333-3333-3333-333333333333';
    await query(
      `INSERT INTO actions (id, workspace_id, brief_id, type, payload, approved_at, executed_at, error)
       VALUES ($1, $2, $3, 'task', $4, NOW(), NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET approved_at = NOW(), executed_at = NULL, error = NULL`,
      [
        action3Id,
        testWsId,
        testBriefId,
        JSON.stringify({
          task: 'Update team backlog with new deliverables',
        }),
      ]
    );

    providerCalled = false;
    const taskExecuted = await executeAction(action3Id, { customGmailSend: mockSend });
    assert.equal(providerCalled, false, 'External provider must not be called for in-app task');
    assert.ok(taskExecuted.executed_at, 'task executed_at must be populated');
    console.log('✓ Verified: In-app task executed in-app without calling external APIs.');

    // =========================================================================
    // Test 7: RFC 2822 Email Encoding
    // =========================================================================
    console.log('\n[Test 7] Testing RFC 2822 base64url email serialization...');
    const encoded = buildRfc2822Message('test@test.com', 'Hello World', 'Line 1\nLine 2');
    const decoded = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    assert.ok(decoded.includes('To: test@test.com'));
    assert.ok(decoded.includes('Subject: =?utf-8?B?'));
    assert.ok(decoded.includes('Line 1\nLine 2'));
    console.log('✓ Verified: RFC 2822 MIME message formatting and base64url encoding.');

    console.log('\n=== ALL ACTION EXECUTION & SAFETY TESTS PASSED ===\n');
  } finally {
    // Cleanup test artifacts
    await query(`DELETE FROM actions WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM briefs WHERE id = $1`, [testBriefId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [testWsId]);
    await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    await pool.end();
  }
}

runActionExecutionTests().catch((err) => {
  console.error('\nAction execution test suite failed with error:\n', err);
  process.exit(1);
});
