import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, pool } from '../src/db/client';
import { createUserWithWorkspace } from '../src/lib/auth';
import {
  parseEmailString,
  extractMentionedNames,
  resolveContactEmail,
  getWorkspaceContacts,
  ContactInfo,
} from '../src/core/contactResolver';
import {
  parseProposedAction,
  executeAction,
  buildRfc2822Message,
} from '../src/core/actionExecutor';

describe('Feature E6 — Mention @names in Actions & Contact Auto-Resolution Suite', () => {
  let userResult: any;
  let workspaceId: string;
  let testBriefId: string;

  before(async () => {
    const email = `test_mentions_${Date.now()}@ballast.local`;
    userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Mentions Test User',
      workspaceName: 'Mentions Workspace',
    });
    workspaceId = userResult.workspace.id;

    // Upgrade workspace to operator plan for action execution tests
    await query(`UPDATE workspaces SET plan = 'operator' WHERE id = $1`, [workspaceId]);

    // Insert test brief
    const bRes = await query<{ id: string }>(
      `INSERT INTO briefs (workspace_id, question, mode, status, markdown, as_of)
       VALUES ($1, 'Action Mention Resolution Test', 'home', 'published', '# Markdown', NOW())
       RETURNING id`,
      [workspaceId]
    );
    testBriefId = bRes[0].id;

    // Seed realistic contacts via sources table: Gmail message and Calendar event
    await query(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, meta, synced_at)
       VALUES 
       ($1, 'gmail', 'msg-elena-1', 'hash1', '{"from": "Elena Rostova <elena.rostova@legal.corp>", "subject": "Compliance Review"}'::jsonb, NOW()),
       ($1, 'calendar', 'event-alex-1', 'hash2', '{"organizer": "alex.chen@acme.corp", "attendees": ["elena.rostova@legal.corp", "sarah.connor@cyber.corp"]}'::jsonb, NOW())`,
      [workspaceId]
    );
  });

  after(async () => {
    await query(`DELETE FROM actions WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM briefs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    await query(`DELETE FROM users WHERE id = $1`, [userResult.user.id]);
    await pool.end();
  });

  it('correctly parses raw email strings with and without display names', () => {
    const full = parseEmailString('Elena Rostova <elena.rostova@legal.corp>');
    assert.equal(full?.name, 'Elena Rostova');
    assert.equal(full?.email, 'elena.rostova@legal.corp');

    const simple = parseEmailString('alex.chen@acme.corp');
    assert.equal(simple?.name, 'Alex Chen');
    assert.equal(simple?.email, 'alex.chen@acme.corp');

    const invalid = parseEmailString('not-an-email');
    assert.equal(invalid, null);
  });

  it('extracts mentioned names and @mentions from action strings', () => {
    const mentions1 = extractMentionedNames('Draft email to Elena regarding GDPR consent');
    assert.ok(mentions1.some((m) => m.toLowerCase().includes('elena')));

    const mentions2 = extractMentionedNames('email_draft: to=@alex.chen subject="Stripe Config" body="Please review"');
    assert.ok(mentions2.some((m) => m.toLowerCase().includes('alex.chen')));

    const mentions3 = extractMentionedNames('Send message to Sarah Connor about deployment');
    assert.ok(mentions3.some((m) => m.toLowerCase().includes('sarah connor')));
  });

  it('resolves query names against workspace contacts across name variations', () => {
    const contacts: ContactInfo[] = [
      { name: 'Elena Rostova', email: 'elena.rostova@legal.corp', source: 'gmail' },
      { name: 'Alex Chen', email: 'alex.chen@acme.corp', source: 'calendar' },
      { name: 'Sarah Connor', email: 'sarah.connor@cyber.corp', source: 'calendar' },
    ];

    // First name match
    const r1 = resolveContactEmail('Elena', contacts);
    assert.equal(r1?.email, 'elena.rostova@legal.corp');
    assert.equal(r1?.name, 'Elena Rostova');

    // @mention with username match
    const r2 = resolveContactEmail('@alex.chen', contacts);
    assert.equal(r2?.email, 'alex.chen@acme.corp');

    // Direct email query
    const r3 = resolveContactEmail('sarah.connor@cyber.corp', contacts);
    assert.equal(r3?.email, 'sarah.connor@cyber.corp');

    // Case-insensitivity & full name
    const r4 = resolveContactEmail('elena rostova', contacts);
    assert.equal(r4?.email, 'elena.rostova@legal.corp');
  });

  it('fetches contacts from workspace database sources (Gmail + Calendar)', async () => {
    const contacts = await getWorkspaceContacts(workspaceId);
    assert.ok(contacts.length >= 2, 'Should find at least 2 contacts from seeded sources');

    const hasElena = contacts.some((c) => c.email === 'elena.rostova@legal.corp');
    assert.ok(hasElena, 'Should include Elena Rostova from Gmail source');

    const hasAlex = contacts.some((c) => c.email === 'alex.chen@acme.corp');
    assert.ok(hasAlex, 'Should include Alex Chen from Calendar source');
  });

  it('parseProposedAction auto-resolves "Draft email to Elena" to valid email address', async () => {
    const contacts = await getWorkspaceContacts(workspaceId);
    const parsed = parseProposedAction(
      'Draft email to Elena regarding terms of service sign-off',
      { contacts, workspaceId }
    );

    assert.equal(parsed.type, 'email_draft');
    assert.equal(parsed.payload.to, 'elena.rostova@legal.corp');
    assert.ok(parsed.payload.recipient.includes('Elena Rostova'));
    assert.ok(parsed.payload.resolved_contact);
    assert.equal(parsed.payload.resolved_contact.email, 'elena.rostova@legal.corp');
    assert.equal(parsed.payload.resolved_contact.name, 'Elena Rostova');
  });

  it('parseProposedAction auto-resolves @alex.chen in structured prefix format', async () => {
    const contacts = await getWorkspaceContacts(workspaceId);
    const parsed = parseProposedAction(
      'email_draft: to=@alex.chen subject="Stripe Review" body="Merchant accounts ready for testing"',
      { contacts, workspaceId }
    );

    assert.equal(parsed.type, 'email_draft');
    assert.equal(parsed.payload.to, 'alex.chen@acme.corp');
    assert.equal(parsed.payload.subject, 'Stripe Review');
    assert.ok(parsed.payload.resolved_contact);
    assert.equal(parsed.payload.resolved_contact.email, 'alex.chen@acme.corp');
  });

  it('builds RFC 2822 email message with resolved recipient and executes draft creation', async () => {
    const contacts = await getWorkspaceContacts(workspaceId);
    const parsed = parseProposedAction(
      'Draft email to Elena regarding consumer terms of service',
      { contacts, workspaceId }
    );

    // Verify RFC 2822 encoding
    const rfcMessage = buildRfc2822Message(parsed.payload.to, parsed.payload.subject, parsed.payload.body);
    const decoded = Buffer.from(rfcMessage, 'base64').toString('utf-8');
    assert.ok(decoded.includes(`To: ${parsed.payload.to}`));
    assert.ok(decoded.includes('MIME-Version: 1.0'));

    // Insert action and execute with mock Gmail send function
    const actRes = await query<{ id: string }>(
      `INSERT INTO actions (workspace_id, brief_id, type, payload, approved_at, approved_by)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       RETURNING id`,
      [workspaceId, testBriefId, parsed.type, JSON.stringify(parsed.payload), userResult.user.id]
    );
    const actionId = actRes[0].id;

    let dispatchedTo = '';
    let isDraftCreated = false;

    await executeAction(actionId, {
      customGmailSend: async (params) => {
        dispatchedTo = params.to;
        isDraftCreated = params.isDraftOnly;
        return { messageId: 'mock-gmail-msg-999' };
      },
    });

    assert.equal(dispatchedTo, 'elena.rostova@legal.corp', 'Custom Gmail dispatcher should receive resolved recipient email');
    assert.equal(isDraftCreated, true, 'Draft only flag should be preserved');

    // Confirm action marked executed in database
    const executedRow = await query<{ executed_at: string; error: string | null }>(
      `SELECT executed_at, error FROM actions WHERE id = $1`,
      [actionId]
    );
    assert.ok(executedRow[0].executed_at, 'Action should be marked executed in DB');
    assert.equal(executedRow[0].error, null);
  });
});
