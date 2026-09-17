import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();

process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, pool } from '../src/db/client';
import { createUserWithWorkspace, COOKIE_NAME } from '../src/lib/auth';
import { getSmartQuestionSuggestions } from '../src/core/suggestions';
import { GET as getSuggestionsRoute } from '../src/app/api/suggestions/route';
import { storeEncryptedToken } from '../src/connectors/tokenStore';

describe('Feature E4 — Smart Question Suggestions Suite', () => {
  let userResult: any;
  let workspaceId: string;
  let cookieHeader: string;

  before(async () => {
    const email = `test_suggestions_${Date.now()}@ballast.local`;
    userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Suggestions Test User',
      workspaceName: 'Suggestions Test Workspace',
    });
    workspaceId = userResult.workspace.id;
    cookieHeader = `${COOKIE_NAME}=${userResult.token}`;
  });

  after(async () => {
    await query(`DELETE FROM chunks WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM briefs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM oauth_tokens WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    await query(`DELETE FROM users WHERE id = $1`, [userResult.user.id]);
    await pool.end();
  });

  it('rejects unauthenticated requests to /api/suggestions with 401', async () => {
    const unauthReq = new NextRequest('http://localhost:3000/api/suggestions', {
      method: 'GET',
    });
    const res = await getSuggestionsRoute(unauthReq);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Unauthorized');
  });

  it('returns starter suggestions for a fresh workspace without sources or briefs', async () => {
    const req = new NextRequest('http://localhost:3000/api/suggestions?mode=all&limit=6', {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });
    const res = await getSuggestionsRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.suggestions));
    assert.ok(data.suggestions.length > 0);
    assert.equal(data.count, data.suggestions.length);

    // Should include discovery items
    const hasDiscovery = data.suggestions.some((s: any) => s.category === 'discovery' || s.category === 'world');
    assert.ok(hasDiscovery, 'Should contain starter discovery/world suggestions');
  });

  it('generates stale topic follow-up suggestions for briefs older than 5-7 days', async () => {
    // Insert an older brief published 8 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
    await query(
      `INSERT INTO briefs (workspace_id, question, mode, status, markdown, published_at, created_at)
       VALUES ($1, $2, 'home', 'published', 'Mock Brief Content', $3, $3)`,
      [workspaceId, 'What is the status of the Q3 Billing Revamp?', eightDaysAgo]
    );

    const suggestions = await getSmartQuestionSuggestions(workspaceId, { mode: 'home' });
    const followup = suggestions.find((s) => s.category === 'follow_up');

    assert.ok(followup, 'Should generate a follow_up suggestion for a 8-day-old brief');
    assert.ok(
      followup.question.toLowerCase().includes('q3 billing revamp') || followup.label.toLowerCase().includes('q3 billing revamp'),
      'Suggestion should reference the stale topic'
    );
    assert.ok(followup.reason.includes('8 days'), 'Reason should report the number of days');
  });

  it('generates connector-aware suggestions when integrations are connected', async () => {
    // Store mock credentials and sources for calendar and github
    await storeEncryptedToken(workspaceId, 'calendar', {
      access_token: 'mock_cal_token',
    });

    await query(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, meta, synced_at)
       VALUES ($1, 'calendar', 'cal-event-101', 'calhash1', '{"title": "Q3 Billing & Stripe Deployment Review"}'::jsonb, NOW()),
              ($1, 'github', 'gh-pr-42', 'ghhash1', '{"title": "Add webhook verification middleware"}'::jsonb, NOW())`,
      [workspaceId]
    );

    const suggestions = await getSmartQuestionSuggestions(workspaceId, { mode: 'home' });

    const calSuggestion = suggestions.find((s) => s.sourcesInvolved?.includes('calendar') || s.icon === 'calendar');
    assert.ok(calSuggestion, 'Should include calendar-grounded suggestion');
    assert.ok(calSuggestion.label.includes('Calendar') || calSuggestion.question.includes('calendar') || calSuggestion.question.includes('Deployment Review'));

    const ghSuggestion = suggestions.find((s) => s.sourcesInvolved?.includes('github') || s.icon === 'github');
    assert.ok(ghSuggestion, 'Should include github-grounded suggestion');
    assert.ok(ghSuggestion.label.includes('GitHub') || ghSuggestion.question.includes('GitHub'));
  });

  it('filters suggestions properly when mode=world vs mode=home', async () => {
    const worldReq = new NextRequest('http://localhost:3000/api/suggestions?mode=world', {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });
    const worldRes = await getSuggestionsRoute(worldReq);
    assert.equal(worldRes.status, 200);
    const worldData = await worldRes.json();

    assert.ok(worldData.suggestions.length > 0);
    assert.ok(worldData.suggestions.every((s: any) => s.mode === 'world'), 'All returned suggestions should be mode=world');

    const homeReq = new NextRequest('http://localhost:3000/api/suggestions?mode=home', {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });
    const homeRes = await getSuggestionsRoute(homeReq);
    assert.equal(homeRes.status, 200);
    const homeData = await homeRes.json();

    assert.ok(homeData.suggestions.length > 0);
    assert.ok(homeData.suggestions.every((s: any) => s.mode === 'home'), 'All returned suggestions should be mode=home');
  });

  it('respects limit parameter and caps output correctly', async () => {
    const limitReq = new NextRequest('http://localhost:3000/api/suggestions?limit=2', {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });
    const limitRes = await getSuggestionsRoute(limitReq);
    assert.equal(limitRes.status, 200);
    const limitData = await limitRes.json();

    assert.equal(limitData.suggestions.length, 2);
    assert.equal(limitData.count, 2);
  });
});
