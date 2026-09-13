import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { CONNECTOR_REGISTRY, getAllConnectors, getConnector } from '../src/connectors/registry';
import { gmailConnector } from '../src/connectors/gmail';
import { calendarConnector } from '../src/connectors/calendar';
import { driveConnector } from '../src/connectors/drive';
import { gitHubConnector } from '../src/connectors/github';
import { slackConnector } from '../src/connectors/slack';
import { notionConnector } from '../src/connectors/notion';

async function runTests() {
  console.log('=== Ballast Connector Registry & De-mock Test Suite ===\n');

  // Test 1: Registry Completeness
  console.log('[Test 1] Verifying all 6 required connectors exist in registry...');
  const expectedConnectors = ['gmail', 'calendar', 'drive', 'github', 'slack', 'notion'];
  const all = getAllConnectors();
  const registeredIds = all.map((c) => c.id);

  for (const exp of expectedConnectors) {
    assert.ok(registeredIds.includes(exp as any), `Missing connector in registry: ${exp}`);
  }
  assert.equal(all.length, 6, `Expected 6 connectors in registry, got ${all.length}`);
  console.log('✓ All 6 connectors registered successfully:', registeredIds.join(', '));

  // Test 2: Standard Interface Contract Compliance
  console.log('\n[Test 2] Verifying SourceConnector contract implementation on all instances...');
  for (const def of all) {
    const conn = def.connector;
    assert.ok(conn.id, `Connector ${def.name} missing id`);
    assert.ok(conn.name, `Connector ${def.name} missing name`);
    assert.equal(typeof conn.health, 'function', `${def.name} missing health()`);
    assert.equal(typeof conn.list_changes, 'function', `${def.name} missing list_changes()`);
    assert.equal(typeof conn.fetch, 'function', `${def.name} missing fetch()`);
    assert.equal(typeof conn.sync, 'function', `${def.name} missing sync()`);
    assert.equal(typeof conn.revoke, 'function', `${def.name} missing revoke()`);
  }
  console.log('✓ All 6 connectors strictly satisfy SourceConnector interface');

  // Test 3: No Silent Mock Fallback in Production (Must Fail Loudly)
  console.log('\n[Test 3] Verifying loud failure in production when tokens/credentials are absent...');
  const origEvalMock = process.env.EVAL_USE_MOCK;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    process.env.EVAL_USE_MOCK = 'false';
    process.env.NODE_ENV = 'production';
    const fakeWorkspace = 'ws_unconfigured_test';

    // Gmail must fail loudly
    let gmailFailedLoudly = false;
    try {
      await gmailConnector.list_changes({ workspaceId: fakeWorkspace });
    } catch (e: any) {
      if (e.message.includes('not connected or token has been revoked')) {
        gmailFailedLoudly = true;
      }
    }
    assert.equal(gmailFailedLoudly, true, 'Gmail must throw loudly when unconfigured in production');

    // Calendar must fail loudly
    let calendarFailedLoudly = false;
    try {
      await calendarConnector.list_changes({ workspaceId: fakeWorkspace });
    } catch (e: any) {
      if (e.message.includes('not connected or token has been revoked')) {
        calendarFailedLoudly = true;
      }
    }
    assert.equal(calendarFailedLoudly, true, 'Calendar must throw loudly when unconfigured in production');

    // Drive must fail loudly
    let driveFailedLoudly = false;
    try {
      await driveConnector.list_changes({ workspaceId: fakeWorkspace });
    } catch (e: any) {
      if (e.message.includes('not connected or token has been revoked')) {
        driveFailedLoudly = true;
      }
    }
    assert.equal(driveFailedLoudly, true, 'Drive must throw loudly when unconfigured in production');

    // GitHub must fail loudly
    let githubFailedLoudly = false;
    try {
      await gitHubConnector.list_changes({ workspaceId: fakeWorkspace });
    } catch (e: any) {
      if (e.message.includes('not connected or token has been revoked')) {
        githubFailedLoudly = true;
      }
    }
    assert.equal(githubFailedLoudly, true, 'GitHub must throw loudly when unconfigured in production');

    // Slack must fail loudly
    let slackFailedLoudly = false;
    try {
      await slackConnector.list_changes({ workspaceId: fakeWorkspace });
    } catch (e: any) {
      if (e.message.includes('not connected or token has been revoked')) {
        slackFailedLoudly = true;
      }
    }
    assert.equal(slackFailedLoudly, true, 'Slack must throw loudly when unconfigured in production');

    // Notion must fail loudly
    let notionFailedLoudly = false;
    try {
      await notionConnector.list_changes({ workspaceId: fakeWorkspace });
    } catch (e: any) {
      if (e.message.includes('not connected or token has been revoked')) {
        notionFailedLoudly = true;
      }
    }
    assert.equal(notionFailedLoudly, true, 'Notion must throw loudly when unconfigured in production');

    console.log('✓ All 6 connectors fail loudly without silent mock fallback in production');
  } finally {
    process.env.EVAL_USE_MOCK = origEvalMock;
    process.env.NODE_ENV = origNodeEnv;
  }

  // Test 4: Explicit Mock/Test Mode Execution
  console.log('\n[Test 4] Verifying explicit mock fallback in eval/test mode...');
  process.env.EVAL_USE_MOCK = 'true';
  const testWorkspace = 'ws_eval_test';

  const gmailItems = await gmailConnector.list_changes({ workspaceId: testWorkspace });
  assert.ok(gmailItems.length > 0, 'Expected sample Gmail items in mock mode');

  const calItems = await calendarConnector.list_changes({ workspaceId: testWorkspace });
  assert.ok(calItems.length > 0, 'Expected sample Calendar items in mock mode');

  const driveItems = await driveConnector.list_changes({ workspaceId: testWorkspace });
  assert.ok(driveItems.length > 0, 'Expected sample Drive items in mock mode');

  const ghItems = await gitHubConnector.list_changes({ workspaceId: testWorkspace });
  assert.ok(ghItems.length > 0, 'Expected sample GitHub items in mock mode');

  const slackItems = await slackConnector.list_changes({ workspaceId: testWorkspace });
  assert.ok(slackItems.length > 0, 'Expected sample Slack items in mock mode');

  const notionItems = await notionConnector.list_changes({ workspaceId: testWorkspace });
  assert.ok(notionItems.length > 0, 'Expected sample Notion items in mock mode');

  console.log('✓ All 6 connectors cleanly serve fixture content under explicit EVAL_USE_MOCK=true');

  // Test 5: Checksum and Document Fetch Verification
  console.log('\n[Test 5] Verifying SHA-256 checksum integrity and fetch...');
  const firstGmail = await gmailConnector.fetch(testWorkspace, gmailItems[0].externalId);
  assert.equal(firstGmail.externalId, gmailItems[0].externalId);
  assert.ok(firstGmail.checksum.length === 64, 'SHA-256 checksum must be 64 hex characters');

  const firstCal = await calendarConnector.fetch(testWorkspace, calItems[0].externalId);
  assert.equal(firstCal.externalId, calItems[0].externalId);
  assert.ok(firstCal.checksum.length === 64, 'Calendar checksum must be 64 hex characters');

  console.log('✓ Content hashing and document retrieval verified');

  console.log('\n=== ALL CONNECTOR TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('❌ Connector Tests Failed:', err);
  process.exit(1);
});
