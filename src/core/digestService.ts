import { query, queryOne } from '@/db/client';
import { escapeHtml, UserNotificationPreferences } from './emailService';

export interface DigestBriefItem {
  id: string;
  question: string;
  title: string;
  summary: string | null;
  mode: 'home' | 'world';
  created_at: string;
  claim_count: number;
  actions_count: number;
}

export interface DigestActionItem {
  id: string;
  brief_id: string;
  type: string;
  status: string;
  title: string;
  summary: string | null;
}

export interface WorkspaceDigestData {
  workspaceId: string;
  workspaceName: string;
  startDate: string;
  endDate: string;
  lookbackDays: number;
  briefs: DigestBriefItem[];
  actions: DigestActionItem[];
  totalBriefs: number;
  totalClaims: number;
  totalActions: number;
  summaryHighlights: string[];
}

export interface SendDigestOptions {
  workspaceId: string;
  lookbackDays?: number;
  force?: boolean;
  recipientUserIds?: string[];
  testEmail?: string;
}

export interface SendDigestResult {
  sent: boolean;
  reason?: string;
  workspaceId: string;
  workspaceName: string;
  briefCount: number;
  claimCount: number;
  recipientCount: number;
  recipients: string[];
}

/**
 * Resolves the primary web app base URL.
 */
function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/**
 * Compiles a structured digest of published briefs and proposed actions for a workspace.
 */
export async function buildWorkspaceDigest(
  workspaceId: string,
  options?: { lookbackDays?: number; sinceDate?: Date }
): Promise<WorkspaceDigestData> {
  const lookbackDays = options?.lookbackDays || 7;
  const now = new Date();
  const since = options?.sinceDate || new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  // 1. Fetch workspace name
  const ws = await queryOne<{ name: string }>(
    `SELECT name FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const workspaceName = ws?.name || 'Workspace';

  // 2. Fetch published briefs in the lookback window
  const rawBriefs = await query<{
    id: string;
    question: string;
    mode: 'home' | 'world';
    summary: string | null;
    created_at: string;
  }>(
    `SELECT id, question, mode, summary, created_at
     FROM briefs
     WHERE workspace_id = $1
       AND status = 'published'
       AND created_at >= $2
     ORDER BY created_at DESC`,
    [workspaceId, since.toISOString()]
  );

  const briefIds = rawBriefs.map((b) => b.id);

  // 3. Fetch citation counts per brief
  const claimCountsMap = new Map<string, number>();
  if (briefIds.length > 0) {
    const citationRows = await query<{ brief_id: string; count: string }>(
      `SELECT brief_id, COUNT(*)::text as count
       FROM citations
       WHERE brief_id = ANY($1::uuid[])
       GROUP BY brief_id`,
      [briefIds]
    );
    for (const r of citationRows) {
      claimCountsMap.set(r.brief_id, parseInt(r.count, 10) || 0);
    }
  }

  // 4. Fetch actions created during this period or linked to these briefs
  const actionRows = await query<{
    id: string;
    brief_id: string;
    type: string;
    payload: any;
    approved_at: string | null;
    executed_at: string | null;
  }>(
    `SELECT a.id, a.brief_id, a.type, a.payload, a.approved_at, a.executed_at
     FROM actions a
     WHERE a.workspace_id = $1
       AND (
         (a.brief_id = ANY($2::uuid[]))
         OR (a.created_at >= $3)
       )
     ORDER BY a.created_at DESC`,
    [workspaceId, briefIds.length > 0 ? briefIds : ['00000000-0000-0000-0000-000000000000'], since.toISOString()]
  );

  const actionsPerBriefMap = new Map<string, number>();
  const actions: DigestActionItem[] = actionRows.map((a) => {
    if (a.brief_id) {
      actionsPerBriefMap.set(a.brief_id, (actionsPerBriefMap.get(a.brief_id) || 0) + 1);
    }
    const payload = typeof a.payload === 'object' && a.payload !== null ? a.payload : {};
    const title = payload.subject || payload.title || `Action: ${a.type.replace('_', ' ')}`;
    const summary = payload.body || payload.summary || null;
    const status = a.executed_at ? 'executed' : a.approved_at ? 'approved' : 'pending_approval';
    return {
      id: a.id,
      brief_id: a.brief_id,
      type: a.type,
      status,
      title,
      summary,
    };
  });

  // 5. Construct DigestBriefItems
  let totalClaims = 0;
  const briefs: DigestBriefItem[] = rawBriefs.map((b) => {
    const claimCount = claimCountsMap.get(b.id) || 0;
    totalClaims += claimCount;
    const actionsCount = actionsPerBriefMap.get(b.id) || 0;
    const title = b.question.length > 80 ? `${b.question.slice(0, 77)}...` : b.question;
    return {
      id: b.id,
      question: b.question,
      title,
      summary: b.summary,
      mode: b.mode,
      created_at: b.created_at,
      claim_count: claimCount,
      actions_count: actionsCount,
    };
  });

  // 6. Synthesize high-level summary highlights
  const summaryHighlights: string[] = briefs
    .filter((b) => b.summary && b.summary.trim().length > 0)
    .map((b) => b.summary!)
    .slice(0, 5);

  return {
    workspaceId,
    workspaceName,
    startDate: since.toISOString(),
    endDate: now.toISOString(),
    lookbackDays,
    briefs,
    actions,
    totalBriefs: briefs.length,
    totalClaims,
    totalActions: actions.length,
    summaryHighlights,
  };
}

/**
 * Formats a Date range string cleanly (e.g. "Sep 10 – Sep 17, 2026")
 */
function formatDateRange(startDateStr: string, endDateStr: string): string {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const endDay = end.getDate();
  const year = end.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

/**
 * Renders rich, responsive HTML email template for the weekly digest.
 * Strict XSS / HTML escaping applied to all user-controlled text (Security S5).
 */
export function renderDigestEmailHtml(data: WorkspaceDigestData, appUrl: string = getAppUrl()): string {
  const safeWsName = escapeHtml(data.workspaceName);
  const dateRangeFormatted = formatDateRange(data.startDate, data.endDate);
  const dashboardUrl = `${appUrl}/app`;

  // Briefs list HTML
  const briefsHtml =
    data.briefs.length > 0
      ? data.briefs
          .map((b) => {
            const safeTitle = escapeHtml(b.title);
            const safeQuestion = escapeHtml(b.question);
            const safeSummary = b.summary ? escapeHtml(b.summary) : null;
            const briefUrl = `${appUrl}/app?briefId=${encodeURIComponent(b.id)}`;
            const dateStr = new Date(b.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            const modeBadge = b.mode === 'world' ? 'World' : 'Home';
            const modeColor = b.mode === 'world' ? '#06b6d4' : '#10b981';

            return `
            <div style="background-color:#0f172a;border-radius:8px;padding:18px;margin-bottom:14px;border:1px solid #334155;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <div style="margin-bottom:6px;">
                  <span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;border-radius:4px;background-color:${modeColor}20;color:${modeColor};border:1px solid ${modeColor}40;margin-right:8px;text-transform:uppercase;">
                    ${modeBadge} Mode
                  </span>
                  <span style="font-size:12px;color:#94a3b8;font-weight:500;">
                    ${dateStr}
                  </span>
                </div>
              </div>
              
              <h2 style="margin:0 0 8px 0;font-size:15px;font-weight:600;color:#f8fafc;line-height:1.4;">
                <a href="${briefUrl}" target="_blank" style="color:#f8fafc;text-decoration:none;">
                  ${safeTitle}
                </a>
              </h2>

              <p style="margin:0 0 10px 0;font-size:13px;color:#94a3b8;line-height:1.5;">
                ${safeQuestion}
              </p>

              ${
                safeSummary
                  ? `
              <div style="background-color:#1e293b;border-left:3px solid #3b82f6;border-radius:4px;padding:10px 12px;margin:10px 0;">
                <p style="margin:0;font-size:13px;color:#cbd5e1;line-height:1.5;font-style:italic;">
                  <strong style="color:#93c5fd;font-style:normal;">TL;DR:</strong> ${safeSummary}
                </p>
              </div>
              `
                  : ''
              }

              <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;color:#64748b;">
                  &#10003; <strong>${b.claim_count}</strong> verified claim(s) ${
              b.actions_count > 0 ? `&bull; <strong>${b.actions_count}</strong> action(s)` : ''
            }
                </span>
                <a href="${briefUrl}" target="_blank" style="font-size:12px;font-weight:600;color:#38bdf8;text-decoration:none;">
                  Read Brief &rarr;
                </a>
              </div>
            </div>
            `;
          })
          .join('')
      : `
      <div style="background-color:#0f172a;border-radius:8px;padding:24px;text-align:center;border:1px dashed #334155;">
        <p style="margin:0;font-size:14px;color:#94a3b8;">
          No automated briefs were published in this workspace during the past ${data.lookbackDays} days.
        </p>
      </div>
      `;

  // Actions Rollup HTML
  const actionsHtml =
    data.actions.length > 0
      ? `
      <div style="margin-top:28px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <h3 style="margin:0;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">
            Proposed &amp; Pending Actions (${data.actions.length})
          </h3>
        </div>
        <div style="background-color:#0f172a;border-radius:8px;padding:14px;border:1px solid #334155;">
          ${data.actions
            .slice(0, 4)
            .map((a) => {
              const safeTitle = escapeHtml(a.title);
              const safeType = escapeHtml(a.type.replace('_', ' '));
              const statusBadge = a.status === 'executed' ? 'Executed' : a.status === 'approved' ? 'Approved' : 'Pending Approval';
              const statusColor = a.status === 'executed' ? '#10b981' : a.status === 'approved' ? '#3b82f6' : '#f59e0b';
              return `
              <div style="padding:8px 0;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <span style="font-size:11px;color:#94a3b8;text-transform:capitalize;font-weight:600;margin-right:6px;">[${safeType}]</span>
                  <span style="font-size:13px;color:#e2e8f0;">${safeTitle}</span>
                </div>
                <span style="font-size:11px;font-weight:600;color:${statusColor};padding:2px 6px;border-radius:4px;background-color:${statusColor}15;">
                  ${statusBadge}
                </span>
              </div>
              `;
            })
            .join('')}
          ${
            data.actions.length > 4
              ? `<p style="margin:8px 0 0 0;font-size:12px;color:#64748b;text-align:center;">+ ${data.actions.length - 4} more actions in Ballast</p>`
              : ''
          }
        </div>
      </div>
      `
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Intelligence Digest — ${safeWsName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;color:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0b0f19;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:620px;background-color:#1e293b;border-radius:14px;overflow:hidden;border:1px solid #334155;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">
          <!-- Gradient Top Bar -->
          <tr>
            <td style="background:linear-gradient(90deg, #3b82f6 0%, #6366f1 50%, #10b981 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px 32px;background-color:#162032;border-bottom:1px solid #334155;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
                      BALLAST <span style="font-size:13px;font-weight:500;color:#94a3b8;margin-left:6px;">/ DIGEST</span>
                    </div>
                    <div style="font-size:13px;color:#94a3b8;margin-top:4px;">
                      ${safeWsName} &bull; ${dateRangeFormatted}
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;font-size:12px;font-weight:600;border-radius:9999px;background-color:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);">
                      Weekly Briefing
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Metrics Strip -->
          <tr>
            <td style="padding:16px 32px;background-color:#0f172a;border-bottom:1px solid #334155;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="33%" align="center" style="border-right:1px solid #334155;">
                    <div style="font-size:22px;font-weight:700;color:#ffffff;">${data.totalBriefs}</div>
                    <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:0.05em;margin-top:2px;">Briefs Published</div>
                  </td>
                  <td width="33%" align="center" style="border-right:1px solid #334155;">
                    <div style="font-size:22px;font-weight:700;color:#10b981;">${data.totalClaims}</div>
                    <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:0.05em;margin-top:2px;">Verified Claims</div>
                  </td>
                  <td width="33%" align="center">
                    <div style="font-size:22px;font-weight:700;color:#f59e0b;">${data.totalActions}</div>
                    <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:0.05em;margin-top:2px;">Proposed Actions</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:28px 32px 32px 32px;">
              <div style="margin-bottom:20px;">
                <h3 style="margin:0 0 14px 0;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">
                  Published Intelligence Briefs (${data.totalBriefs})
                </h3>
                ${briefsHtml}
              </div>

              ${actionsHtml}

              <!-- Main CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:32px 0 12px 0;width:100%;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#3b82f6;border-radius:8px;text-decoration:none;box-shadow:0 4px 12px rgba(59,130,246,0.3);">
                      Open Ballast Workspace &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#162032;border-top:1px solid #334155;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
                      You are receiving the Ballast Weekly Digest for <strong>${safeWsName}</strong>.
                      <br>
                      To adjust your digest schedule or frequency, visit your <a href="${appUrl}/app" style="color:#94a3b8;text-decoration:underline;">Account Preferences</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Renders a clean plaintext fallback email for the weekly digest.
 */
export function renderDigestEmailText(data: WorkspaceDigestData, appUrl: string = getAppUrl()): string {
  const dateRangeFormatted = formatDateRange(data.startDate, data.endDate);
  const dashboardUrl = `${appUrl}/app`;

  let text = `BALLAST / WEEKLY INTELLIGENCE DIGEST\n`;
  text += `Workspace: ${data.workspaceName}\n`;
  text += `Period: ${dateRangeFormatted}\n`;
  text += `==================================================\n\n`;

  text += `WEEKLY SUMMARY:\n`;
  text += `• Total Briefs Published: ${data.totalBriefs}\n`;
  text += `• Total Verified Claims: ${data.totalClaims}\n`;
  text += `• Proposed Actions: ${data.totalActions}\n\n`;

  text += `PUBLISHED BRIEFS:\n`;
  text += `--------------------------------------------------\n`;
  if (data.briefs.length === 0) {
    text += `No briefs were published in this period.\n\n`;
  } else {
    for (const b of data.briefs) {
      const briefUrl = `${appUrl}/app?briefId=${encodeURIComponent(b.id)}`;
      text += `• ${b.title} [${b.mode.toUpperCase()} MODE]\n`;
      text += `  Question: ${b.question}\n`;
      if (b.summary) {
        text += `  TL;DR: ${b.summary}\n`;
      }
      text += `  Verified Claims: ${b.claim_count} | Actions: ${b.actions_count}\n`;
      text += `  View: ${briefUrl}\n\n`;
    }
  }

  if (data.actions.length > 0) {
    text += `PROPOSED ACTIONS:\n`;
    text += `--------------------------------------------------\n`;
    for (const a of data.actions.slice(0, 5)) {
      text += `• [${a.type}] ${a.title} (${a.status})\n`;
    }
    text += `\n`;
  }

  text += `Open Ballast Workspace: ${dashboardUrl}\n\n`;
  text += `To manage your email preferences, visit ${dashboardUrl}.\n`;

  return text;
}

/**
 * Dispatches the weekly digest email to opted-in workspace members or a target test address.
 */
export async function sendWorkspaceDigest(params: SendDigestOptions): Promise<SendDigestResult> {
  const { workspaceId, lookbackDays = 7, force = false, recipientUserIds, testEmail } = params;

  // 1. Build digest data
  const digestData = await buildWorkspaceDigest(workspaceId, { lookbackDays });

  // 2. If no briefs exist and not forced, skip sending
  if (digestData.totalBriefs === 0 && !force && !testEmail) {
    return {
      sent: false,
      reason: 'no_briefs_in_window',
      workspaceId,
      workspaceName: digestData.workspaceName,
      briefCount: 0,
      claimCount: 0,
      recipientCount: 0,
      recipients: [],
    };
  }

  // 3. Resolve target recipients
  let targetEmails: string[] = [];

  if (testEmail) {
    targetEmails = [testEmail];
  } else {
    // Fetch members and preferences
    const members = await query<{
      id: string;
      email: string;
      name: string | null;
      notification_preferences: UserNotificationPreferences | null;
    }>(
      `SELECT u.id, u.email, u.name, (to_jsonb(u.*) -> 'notification_preferences')::jsonb as notification_preferences
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );

    const activeRecipients = members.filter((member) => {
      if (recipientUserIds && recipientUserIds.length > 0) {
        if (!recipientUserIds.includes(member.id)) return false;
      }
      const prefs = member.notification_preferences;
      if (!prefs) return true; // Default opt-in
      if (prefs.email_enabled === false) return false;
      if (prefs.digest_enabled === false) return false;
      return true;
    });

    targetEmails = activeRecipients.map((r) => r.email).filter(Boolean);
  }

  if (targetEmails.length === 0) {
    return {
      sent: false,
      reason: 'no_opted_in_recipients',
      workspaceId,
      workspaceName: digestData.workspaceName,
      briefCount: digestData.totalBriefs,
      claimCount: digestData.totalClaims,
      recipientCount: 0,
      recipients: [],
    };
  }

  // 4. Render HTML and Text templates
  const appUrl = getAppUrl();
  const htmlContent = renderDigestEmailHtml(digestData, appUrl);
  const textContent = renderDigestEmailText(digestData, appUrl);
  const dateRangeFormatted = formatDateRange(digestData.startDate, digestData.endDate);
  const subject = `[Ballast] Weekly Intelligence Digest (${dateRangeFormatted}) — ${digestData.workspaceName}`;

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'Ballast <onboarding@resend.dev>';

  if (!resendApiKey) {
    console.log(
      `[Digest Service] RESEND_API_KEY not configured. Simulated weekly digest to ${targetEmails.join(', ')}: "${subject}"`
    );
  } else {
    for (const email of targetEmails) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject,
            html: htmlContent,
            text: textContent,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.warn(`[Digest Service Warning] Failed sending digest to ${email}: HTTP ${res.status} - ${errBody}`);
        } else {
          console.log(`[Digest Service] Digest sent successfully to ${email} for workspace ${workspaceId}`);
        }
      } catch (err) {
        console.warn(`[Digest Service Warning] Network error sending digest to ${email}:`, err);
      }
    }
  }

  // 5. Record access log audit trail
  try {
    const actionLabel = `digest_sent:weekly:${digestData.totalBriefs}_briefs`;
    await query(
      `INSERT INTO access_logs (workspace_id, action)
       VALUES ($1, $2)`,
      [workspaceId, actionLabel]
    );
  } catch (logErr) {
    console.error('[Digest Service] Failed to log digest dispatch in access_logs:', logErr);
  }

  return {
    sent: true,
    workspaceId,
    workspaceName: digestData.workspaceName,
    briefCount: digestData.totalBriefs,
    claimCount: digestData.totalClaims,
    recipientCount: targetEmails.length,
    recipients: targetEmails,
  };
}

/**
 * Returns digest data and rendered preview for a workspace.
 */
export async function previewWorkspaceDigest(workspaceId: string, lookbackDays: number = 7) {
  const digestData = await buildWorkspaceDigest(workspaceId, { lookbackDays });
  const appUrl = getAppUrl();
  const html = renderDigestEmailHtml(digestData, appUrl);
  const text = renderDigestEmailText(digestData, appUrl);

  return {
    data: digestData,
    html,
    text,
  };
}

/**
 * Evaluates active workspaces for due weekly digests, checking against double-send guard.
 */
export async function checkAndTriggerDueDigests(workspaceIdFilter?: string): Promise<number> {
  let digestsSent = 0;

  try {
    // 1. Fetch active workspaces (optionally filtered)
    const workspaces = workspaceIdFilter
      ? await query<{ id: string; name: string }>(`SELECT id, name FROM workspaces WHERE id = $1`, [workspaceIdFilter])
      : await query<{ id: string; name: string }>(`SELECT id, name FROM workspaces`);

    for (const ws of workspaces) {
      try {
        // 2. Check if a digest was sent in the last 6 days to prevent double-firing
        const recentPass = await queryOne<{ created_at: string }>(
          `SELECT created_at FROM access_logs
           WHERE workspace_id = $1
             AND action LIKE 'digest_sent:weekly%'
             AND created_at > NOW() - INTERVAL '6 days'
           ORDER BY created_at DESC LIMIT 1`,
          [ws.id]
        ).catch(() => null);

        if (recentPass) {
          continue;
        }

        // 3. Check if any published briefs exist in the last 7 days
        const hasBriefs = await queryOne<{ count: string }>(
          `SELECT COUNT(*)::text as count FROM briefs
           WHERE workspace_id = $1
             AND status = 'published'
             AND created_at > NOW() - INTERVAL '7 days'`,
          [ws.id]
        );

        if (!hasBriefs || parseInt(hasBriefs.count, 10) === 0) {
          continue;
        }

        console.log(`[Digest Worker] Weekly digest is due for workspace "${ws.name}" (${ws.id}). Dispatching...`);
        const result = await sendWorkspaceDigest({
          workspaceId: ws.id,
          lookbackDays: 7,
          force: false,
        });

        if (result.sent) {
          digestsSent++;
        }
      } catch (wsErr: any) {
        console.error(`[Digest Worker] Error processing digest for workspace ${ws.id}:`, wsErr.message);
      }
    }
  } catch (err: any) {
    console.error('[Digest Worker] Error in checkAndTriggerDueDigests:', err);
  }

  return digestsSent;
}
