import { query, queryOne } from '@/db/client';
import { getAuthenticatedGmailClient } from '@/connectors/gmail';
import { getDecryptedToken } from '@/connectors/tokenStore';

export interface ActionRecord {
  id: string;
  workspace_id: string;
  brief_id: string;
  type: 'email_draft' | 'issue_draft' | 'comment_draft' | 'task';
  payload: Record<string, any>;
  approved_at: string | null;
  approved_by: string | null;
  executed_at: string | null;
  error: string | null;
  created_at: string;
  plan?: string;
}

export interface ExecuteActionOptions {
  /**
   * Optional custom send function for dependency injection in tests
   */
  customGmailSend?: (params: {
    to: string;
    subject: string;
    body: string;
    rawMessage: string;
    isDraftOnly: boolean;
  }) => Promise<{ messageId: string }>;

  /**
   * Optional custom GitHub dispatch function for dependency injection in tests
   */
  customGitHubDispatch?: (params: {
    type: 'issue_draft' | 'comment_draft';
    repo: string;
    issueNumber?: number;
    title?: string;
    body: string;
  }) => Promise<{ id: string | number; url?: string }>;
}

/**
 * Builds an RFC 2822 compliant email string and encodes it in URL-safe base64.
 */
export function buildRfc2822Message(to: string, subject: string, body: string): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    body,
  ];
  const message = messageParts.join('\r\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Executes an approved action following strict human-in-the-loop and entitlement gates.
 *
 * CRITICAL SAFETY RULES (Phase F & TODO.md Phase 5):
 * 1. UNAPPROVED DRAFT NEVER CALLS SEND: If approved_at is null, execution is immediately rejected.
 * 2. ENTITLEMENT RE-CHECK: Free and Pro plans cannot execute external provider writes.
 *    Operator plan is strictly required.
 * 3. AUDIT TRAIL: Every execution is stamped with executed_at and logged in access_logs.
 *    Any provider error is captured in the error column.
 */
export async function executeAction(
  actionId: string,
  options?: ExecuteActionOptions
): Promise<ActionRecord> {
  // 1. Fetch action record joined with workspace plan
  const action = await queryOne<ActionRecord>(
    `SELECT 
       a.id,
       a.workspace_id,
       a.brief_id,
       a.type,
       a.payload,
       a.approved_at,
       a.approved_by,
       a.executed_at,
       a.error,
       a.created_at,
       w.plan
     FROM actions a
     JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = $1`,
    [actionId]
  );

  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  // 2. CRITICAL SAFETY GATE: Re-check approval
  if (!action.approved_at) {
    const errorMsg = `Action draft ${actionId} cannot be executed: not approved (unapproved draft never calls external APIs)`;
    await query(
      `UPDATE actions SET error = $1 WHERE id = $2`,
      [errorMsg, actionId]
    );
    throw new Error(errorMsg);
  }

  // 3. CRITICAL ENTITLEMENT GATE: Free/Pro: server returns 403 on propose/execute
  if (action.plan !== 'operator') {
    const errorMsg = `Workspace plan '${action.plan || 'free'}' is not entitled to execute external actions. Operator plan required.`;
    await query(
      `UPDATE actions SET error = $1 WHERE id = $2`,
      [errorMsg, actionId]
    );
    throw new Error(errorMsg);
  }

  // If already successfully executed, return early (idempotent)
  if (action.executed_at) {
    return action;
  }

  // 4. Dispatch based on action type
  try {
    if (action.type === 'email_draft') {
      await executeEmailAction(action, options);
    } else if (action.type === 'issue_draft' || action.type === 'comment_draft') {
      await executeGitHubAction(action as ActionRecord & { type: 'issue_draft' | 'comment_draft' }, options);
    } else if (action.type === 'task') {
      // Per TODO.md Phase 5: "A task stays in-app"
      await query(
        `UPDATE actions 
         SET executed_at = NOW(), error = NULL
         WHERE id = $1`,
        [actionId]
      );

      await query(
        `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
         VALUES ($1, NULL, $2, 'task.execute: in-app task completed')`,
        [action.workspace_id, action.brief_id]
      );
    } else {
      throw new Error(`Action type '${action.type}' execution is not supported in this phase.`);
    }

    // 5. Fetch and return updated action record
    const updated = await queryOne<ActionRecord>(
      `SELECT a.*, w.plan 
       FROM actions a 
       JOIN workspaces w ON w.id = a.workspace_id 
       WHERE a.id = $1`,
      [actionId]
    );

    return updated!;
  } catch (err: any) {
    const errMessage = err.message || 'Execution failed';
    await query(
      `UPDATE actions SET error = $1 WHERE id = $2`,
      [errMessage, actionId]
    );

    const failed = await queryOne<ActionRecord>(
      `SELECT a.*, w.plan 
       FROM actions a 
       JOIN workspaces w ON w.id = a.workspace_id 
       WHERE a.id = $1`,
      [actionId]
    );
    throw new Error(errMessage);
  }
}

/**
 * Handles real Gmail send / draft creation for email_draft actions.
 */
async function executeEmailAction(
  action: ActionRecord,
  options?: ExecuteActionOptions
): Promise<void> {
  const payload = typeof action.payload === 'string' ? JSON.parse(action.payload) : action.payload || {};
  const to = payload.to || payload.recipient;
  const subject = payload.subject || 'Follow-up from Ballast Brief';
  const body = payload.body || payload.content || payload.summary || '';
  const isDraftOnly = Boolean(payload.create_draft_only);

  if (!to || !body) {
    throw new Error('Email action payload requires "to" recipient and "body" message text.');
  }

  const rawMessage = buildRfc2822Message(to, subject, body);

  if (options?.customGmailSend) {
    // Used in unit & integration tests
    await options.customGmailSend({
      to,
      subject,
      body,
      rawMessage,
      isDraftOnly,
    });
  } else {
    // Live execution via Google Gmail API
    const { gmail } = await getAuthenticatedGmailClient(action.workspace_id);

    if (isDraftOnly) {
      await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: rawMessage,
          },
        },
      });
    } else {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawMessage,
        },
      });
    }
  }

  // Update action execution status in database
  await query(
    `UPDATE actions 
     SET executed_at = NOW(), error = NULL
     WHERE id = $1`,
    [action.id]
  );

  // Insert audit record into access_logs
  await query(
    `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
     VALUES ($1, NULL, $2, $3)`,
    [
      action.workspace_id,
      action.brief_id,
      `${isDraftOnly ? 'gmail.drafts.create' : 'gmail.messages.send'}: to=${to} subject="${subject}"`,
    ]
  );
}

/**
 * Handles GitHub issue and comment draft creation.
 */
async function executeGitHubAction(
  action: ActionRecord & { type: 'issue_draft' | 'comment_draft' },
  options?: ExecuteActionOptions
): Promise<void> {
  const payload = typeof action.payload === 'string' ? JSON.parse(action.payload) : action.payload || {};
  const repo = payload.repo || payload.repository;
  const body = payload.body || payload.comment || payload.content || '';
  const title = payload.title || 'Brief Action Follow-up';
  const issueNumber = payload.issue_number || payload.number;

  if (!repo) {
    throw new Error('GitHub action payload requires "repo" (e.g. "owner/repo").');
  }
  if (!body) {
    throw new Error('GitHub action payload requires "body" or "comment" text.');
  }

  if (action.type === 'comment_draft' && !issueNumber) {
    throw new Error('GitHub comment_draft requires "issue_number" or "number".');
  }

  if (options?.customGitHubDispatch) {
    await options.customGitHubDispatch({
      type: action.type,
      repo,
      issueNumber: issueNumber ? Number(issueNumber) : undefined,
      title,
      body,
    });
  } else {
    const token = await getDecryptedToken<{ access_token?: string; token?: string }>(action.workspace_id, 'github');
    if (!token) {
      throw new Error('GitHub connector is not connected or token has been revoked');
    }
    const bearerToken = token.access_token || token.token;
    const headers = {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Ballast-OS',
    };

    if (action.type === 'issue_draft') {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to create GitHub issue (${res.status}): ${errText.slice(0, 150)}`);
      }
    } else {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to create GitHub comment (${res.status}): ${errText.slice(0, 150)}`);
      }
    }
  }

  await query(
    `UPDATE actions 
     SET executed_at = NOW(), error = NULL
     WHERE id = $1`,
    [action.id]
  );

  await query(
    `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
     VALUES ($1, NULL, $2, $3)`,
    [
      action.workspace_id,
      action.brief_id,
      `github.${action.type}: repo=${repo} ${issueNumber ? `number=${issueNumber}` : `title="${title}"`}`,
    ]
  );
}
