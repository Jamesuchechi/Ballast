import { query, queryOne } from '@/db/client';
import { getAuthenticatedGmailClient } from '@/connectors/gmail';
import { getDecryptedToken } from '@/connectors/tokenStore';
import {
  ContactInfo,
  resolveContactEmail,
  extractMentionedNames,
  getWorkspaceContacts,
} from './contactResolver';

export type ActionType = 'email_draft' | 'issue_draft' | 'comment_draft' | 'task';

export interface ActionRecord {
  id: string;
  workspace_id: string;
  brief_id: string;
  type: ActionType;
  payload: Record<string, any>;
  approved_at: string | null;
  approved_by: string | null;
  executed_at: string | null;
  error: string | null;
  created_at: string;
  plan?: string;
}

export type ActionDraft = ActionRecord;

export interface ParsedProposedAction {
  type: ActionType;
  payload: Record<string, any>;
}

export interface ParseActionOptions {
  contacts?: ContactInfo[];
  workspaceId?: string;
}

/**
 * Parses and classifies a raw action string or structured object into a strongly typed
 * Action draft with normalized payload for the actions table.
 * Automatically resolves @name and contact mentions from workspace communications (E6).
 */
export function parseProposedAction(
  rawAction: string | Record<string, any>,
  options?: ParseActionOptions
): ParsedProposedAction {
  const nowIso = new Date().toISOString();
  const contacts = options?.contacts;

  // 1. If already an object or valid JSON string
  let obj: Record<string, any> | null = null;
  if (typeof rawAction === 'object' && rawAction !== null) {
    obj = rawAction;
  } else if (typeof rawAction === 'string') {
    const trimmed = rawAction.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        obj = JSON.parse(trimmed);
      } catch {
        obj = null;
      }
    }
  }

  if (obj) {
    const rawType = (obj.type || '').toLowerCase();
    let type: ActionType = 'task';
    if (['email_draft', 'issue_draft', 'comment_draft', 'task'].includes(rawType)) {
      type = rawType as ActionType;
    } else if (obj.to || obj.recipient || rawType === 'email') {
      type = 'email_draft';
    } else if (obj.repo && (obj.issue_number || obj.number || rawType === 'comment')) {
      type = 'comment_draft';
    } else if (obj.repo || obj.repository || rawType === 'issue') {
      type = 'issue_draft';
    }

    const payload: Record<string, any> = {
      ...obj,
      summary: obj.summary || obj.title || obj.body || obj.task || obj.text || 'Action item',
      created_at: obj.created_at || nowIso,
    };

    if (type === 'email_draft') {
      let rawTo = payload.to || payload.recipient || (payload.summary ? extractMentionedNames(payload.summary)[0] : null);
      if (contacts && rawTo) {
        const resolved = resolveContactEmail(rawTo, contacts);
        if (resolved) {
          payload.to = resolved.email;
          payload.recipient = resolved.name ? `${resolved.name} <${resolved.email}>` : resolved.email;
          payload.resolved_contact = {
            name: resolved.name,
            email: resolved.email,
            source: resolved.source,
            query: rawTo,
          };
        } else {
          payload.to = rawTo;
          payload.recipient = rawTo;
        }
      } else {
        payload.to = payload.to || payload.recipient || 'team@example.com';
        payload.recipient = payload.to;
      }

      payload.subject = payload.subject || payload.title || 'Follow-up from Ballast Brief';
      payload.body = payload.body || payload.content || payload.summary || payload.text || 'Action item generated from Ballast brief.';
      if (payload.create_draft_only === undefined) {
        payload.create_draft_only = true;
      }
    } else if (type === 'issue_draft') {
      payload.repo = payload.repo || payload.repository || 'owner/repo';
      payload.title = payload.title || payload.summary || payload.subject || 'Action item';
      payload.body = payload.body || payload.content || payload.summary || 'Action item generated from Ballast brief.';
    } else if (type === 'comment_draft') {
      payload.repo = payload.repo || payload.repository || 'owner/repo';
      payload.issue_number = payload.issue_number || payload.number || 1;
      payload.body = payload.body || payload.content || payload.comment || payload.summary || 'Action comment from Ballast brief.';
    }

    return { type, payload };
  }

  const str = String(rawAction || '').trim();

  // 2. Check for explicit prefix tags like [issue_draft], issue_draft:, [email_draft], email_draft:, etc.
  const prefixMatch = str.match(
    /^\[?(email_draft|email|issue_draft|issue|github_issue|comment_draft|comment|github_comment|task|todo)\]?[:\s-]+(.*)$/i
  );
  let prefixType: string | null = null;
  let remainingStr = str;

  if (prefixMatch) {
    prefixType = prefixMatch[1].toLowerCase();
    remainingStr = prefixMatch[2].trim();
  }

  // Key-value pair extraction if present (e.g. repo=owner/repo title=... body=...)
  const kvRepo = remainingStr.match(/\brepo(?:sitory)?=([^\s]+)/i);
  const kvTo = remainingStr.match(/\b(?:to|recipient)=([^\s]+)/i);
  const kvSubject = remainingStr.match(
    /\bsubject=(?:"([^"]+)"|'([^']+)'|([^,\s]+(?:\s+[^,\s]+)*?)(?=\s+(?:body|to|repo|title)=|$))/i
  );
  const kvTitle = remainingStr.match(
    /\btitle=(?:"([^"]+)"|'([^']+)'|([^,\s]+(?:\s+[^,\s]+)*?)(?=\s+(?:body|repo|issue)=|$))/i
  );
  const kvIssueNum =
    remainingStr.match(/\b(?:issue_number|number|#)=(\d+)/i) ||
    remainingStr.match(/#(\d+)/);
  const kvBody = remainingStr.match(
    /\b(?:body|content|comment)=(?:"([^"]+)"|'([^']+)'|(.*))/i
  );

  // 3. GitHub Comment Draft
  if (
    prefixType === 'comment_draft' ||
    prefixType === 'comment' ||
    prefixType === 'github_comment' ||
    /\b(?:comment\s+on\s+(?:github\s+)?(?:issue|pr|pull\s+request)|github\s+comment)/i.test(str)
  ) {
    const repoMatch = kvRepo
      ? kvRepo[1]
      : str.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[1] || 'owner/repo';
    const numMatch = kvIssueNum
      ? Number(kvIssueNum[1])
      : Number(str.match(/#(\d+)/)?.[1] || 1);
    const bodyContent = kvBody
      ? (kvBody[1] || kvBody[2] || kvBody[3] || '').trim()
      : remainingStr.replace(/^.*?#\d+[:\s-]*/, '') || str;

    return {
      type: 'comment_draft',
      payload: {
        repo: repoMatch,
        issue_number: numMatch,
        body: bodyContent,
        comment: bodyContent,
        summary: str,
        created_at: nowIso,
      },
    };
  }

  // 4. GitHub Issue Draft
  if (
    prefixType === 'issue_draft' ||
    prefixType === 'issue' ||
    prefixType === 'github_issue' ||
    /\b(?:create|open|file|draft)\s+(?:a\s+)?(?:github\s+)?issue/i.test(str) ||
    (/\b(?:github\s+issue|issue)\b/i.test(str) &&
      /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/.test(str))
  ) {
    const repoMatch = kvRepo
      ? kvRepo[1]
      : str.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)?.[1] || 'owner/repo';
    const titleMatch = kvTitle
      ? (kvTitle[1] || kvTitle[2] || kvTitle[3] || '').trim()
      : '';
    const bodyMatch = kvBody
      ? (kvBody[1] || kvBody[2] || kvBody[3] || '').trim()
      : '';

    let title = titleMatch;
    let body = bodyMatch;

    if (!title) {
      const parts = remainingStr.split(/:\s*/);
      if (parts.length > 1) {
        title = parts.slice(1).join(': ').trim();
      } else {
        title =
          remainingStr
            .replace(
              /^.*?issue\s+(?:in|on|for)?\s*(?:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)?[:\s-]*/i,
              ''
            )
            .trim() || str;
      }
    }
    if (!body) {
      body = `Action item generated from Ballast brief: ${title || str}`;
    }

    return {
      type: 'issue_draft',
      payload: {
        repo: repoMatch,
        title,
        body,
        summary: str,
        created_at: nowIso,
      },
    };
  }

  // 5. Email Draft
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const emailMatch = str.match(emailRegex);
  const mentionedNames = extractMentionedNames(str);
  const emailToMatch = str.match(/(?:draft|send)?\s*(?:email|mail|message)\s+to\s+(@?[a-zA-Z0-9._-]+(?:\s+[a-zA-Z0-9._-]+)?)/i);

  if (
    prefixType === 'email_draft' ||
    prefixType === 'email' ||
    /\b(?:draft\s+email|send\s+email|email\s+to|mail\s+to)\b/i.test(str) ||
    emailMatch ||
    mentionedNames.length > 0
  ) {
    let rawTarget = kvTo
      ? kvTo[1]
      : emailMatch
      ? emailMatch[1]
      : mentionedNames.length > 0
      ? mentionedNames[0]
      : emailToMatch
      ? emailToMatch[1]
      : null;

    let to = 'team@example.com';
    let recipientDisplay = 'team@example.com';
    let resolvedContactMeta: Record<string, any> | undefined = undefined;

    if (rawTarget) {
      if (contacts) {
        const resolved = resolveContactEmail(rawTarget, contacts);
        if (resolved) {
          to = resolved.email;
          recipientDisplay = resolved.name ? `${resolved.name} <${resolved.email}>` : resolved.email;
          resolvedContactMeta = {
            name: resolved.name,
            email: resolved.email,
            source: resolved.source,
            query: rawTarget,
          };
        } else if (rawTarget.includes('@') && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(rawTarget)) {
          to = rawTarget;
          recipientDisplay = rawTarget;
        } else {
          to = rawTarget;
          recipientDisplay = rawTarget;
        }
      } else if (rawTarget.includes('@') && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(rawTarget)) {
        to = rawTarget;
        recipientDisplay = rawTarget;
      } else {
        to = rawTarget;
        recipientDisplay = rawTarget;
      }
    }

    const subject = kvSubject
      ? (kvSubject[1] || kvSubject[2] || kvSubject[3] || '').trim()
      : '';
    const body = kvBody
      ? (kvBody[1] || kvBody[2] || kvBody[3] || '').trim()
      : '';

    let extractedSubject = subject;
    let extractedBody = body;

    if (!extractedSubject) {
      const subjectPattern = str.match(
        /(?:regarding|about|subject:?)\s+([^.:\n]+)/i
      );
      if (subjectPattern) {
        extractedSubject = subjectPattern[1].trim();
      } else {
        extractedSubject = 'Follow-up from Ballast Brief';
      }
    }

    if (!extractedBody) {
      extractedBody = str;
    }

    const payload: Record<string, any> = {
      to,
      recipient: recipientDisplay,
      subject: extractedSubject,
      body: extractedBody,
      summary: str,
      create_draft_only: true,
      created_at: nowIso,
    };

    if (resolvedContactMeta) {
      payload.resolved_contact = resolvedContactMeta;
    }

    return {
      type: 'email_draft',
      payload,
    };
  }

  // 6. In-App Task (default safe fallback)
  return {
    type: 'task',
    payload: {
      task: remainingStr || str,
      summary: str,
      title: remainingStr || str,
      created_at: nowIso,
    },
  };
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
  let to = payload.to || payload.recipient;
  const subject = payload.subject || payload.title || 'Follow-up from Ballast Brief';
  let body = payload.body || payload.content || payload.summary || payload.text || payload.task || '';
  const isDraftOnly = payload.create_draft_only !== false; // Defaults to draft creation

  if (!to || to.startsWith('@') || !to.includes('@')) {
    try {
      const contacts = await getWorkspaceContacts(action.workspace_id);
      if (to) {
        const resolved = resolveContactEmail(to, contacts);
        if (resolved) {
          to = resolved.email;
        }
      }

      if (!to || !to.includes('@')) {
        const member = await queryOne<{ email: string }>(
          `SELECT u.email 
           FROM users u 
           JOIN workspace_members wm ON wm.user_id = u.id 
           WHERE wm.workspace_id = $1 
           ORDER BY (wm.role = 'owner') DESC, u.created_at ASC 
           LIMIT 1`,
          [action.workspace_id]
        );
        to = member?.email || 'team@example.com';
      }
    } catch {
      to = 'team@example.com';
    }
  }

  if (!body) {
    body = `Follow-up action item generated from Ballast brief:\n\n${subject}`;
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
