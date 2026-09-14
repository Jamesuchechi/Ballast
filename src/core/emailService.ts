import { query } from '@/db/client';

export interface UserNotificationPreferences {
  email_enabled?: boolean;
  notify_on_publish?: boolean;
  notify_on_fail?: boolean;
}

interface WorkspaceMemberRecipient {
  id: string;
  email: string;
  name: string | null;
  notification_preferences: UserNotificationPreferences | null;
}

export interface BriefEmailNotificationParams {
  workspaceId: string;
  briefId: string;
  type: 'brief_published' | 'brief_failed';
  title: string;
  question: string;
  summaryOrError?: string;
  claimCount?: number;
  pdfUri?: string | null;
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
 * Builds HTML email template for published and failed briefs.
 */
function renderEmailHtml(params: {
  type: 'brief_published' | 'brief_failed';
  title: string;
  question: string;
  summaryOrError?: string;
  claimCount?: number;
  viewUrl: string;
}): string {
  const isPublished = params.type === 'brief_published';
  const statusColor = isPublished ? '#10b981' : '#ef4444';
  const statusLabel = isPublished ? 'Published & Verified' : 'Generation Failed';
  const headerIcon = isPublished ? '✓' : '✗';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;color:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:580px;background-color:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
          <!-- Top Accent Bar -->
          <tr>
            <td style="background-color:${statusColor};height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 16px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:700;letter-spacing:-0.5px;color:#f8fafc;">BALLAST</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;font-size:12px;font-weight:600;border-radius:9999px;background-color:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">
                      ${headerIcon} ${statusLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:16px 32px 32px 32px;">
              <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;line-height:1.4;color:#ffffff;">
                ${params.title}
              </h1>

              <div style="background-color:#0f172a;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #334155;">
                <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:600;">
                  Target Question
                </p>
                <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.5;">
                  ${params.question}
                </p>
              </div>

              ${
                isPublished
                  ? `
              <p style="font-size:14px;color:#cbd5e1;line-height:1.6;margin:0 0 24px 0;">
                Your autonomous brief has completed generation. ${
                  params.claimCount !== undefined
                    ? `Synthesized and cross-checked against <strong>${params.claimCount} verified claim(s)</strong>.`
                    : ''
                }
              </p>
              `
                  : `
              <p style="font-size:14px;color:#fca5a5;line-height:1.6;margin:0 0 24px 0;">
                The scheduled pipeline encountered an issue during synthesis:
                <br>
                <code style="display:block;margin-top:8px;padding:10px;background-color:#450a0a;border-radius:6px;color:#fecaca;font-size:12px;word-break:break-word;">
                  ${params.summaryOrError || 'Pipeline generation failed.'}
                </code>
              </p>
              `
              }

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 16px 0;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#3b82f6;">
                    <a href="${params.viewUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      View Brief in Ballast &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#162032;border-top:1px solid #334155;">
              <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">
                You are receiving this automated alert because you are a member of this Ballast workspace.
                You can manage your email notifications in your Ballast account preferences.
              </p>
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
 * Sends transactional email notifications to opted-in workspace members.
 * Non-blocking: will never throw or interrupt the caller.
 */
export async function sendBriefEmailNotification(
  params: BriefEmailNotificationParams
): Promise<void> {
  try {
    const { workspaceId, briefId, type, title, question, summaryOrError, claimCount } = params;

    // 1. Fetch workspace members and their notification preferences (tolerant to pre/post migration states)
    const members = await query<WorkspaceMemberRecipient>(
      `SELECT u.id, u.email, u.name, (to_jsonb(u.*) -> 'notification_preferences')::jsonb as notification_preferences
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );

    if (!members || members.length === 0) {
      return;
    }

    // 2. Filter recipients based on preferences
    const activeRecipients = members.filter((member) => {
      const prefs = member.notification_preferences;
      if (!prefs) return true; // Default opt-in
      if (prefs.email_enabled === false) return false;

      if (type === 'brief_published' && prefs.notify_on_publish === false) {
        return false;
      }
      if (type === 'brief_failed' && prefs.notify_on_fail === false) {
        return false;
      }
      return true;
    });

    if (activeRecipients.length === 0) {
      return;
    }

    const recipientEmails = activeRecipients.map((r) => r.email).filter(Boolean);
    const appUrl = getAppUrl();
    const viewUrl = `${appUrl}/app?briefId=${encodeURIComponent(briefId)}`;

    const isPublished = type === 'brief_published';
    const subjectPrefix = isPublished ? '✓ Published:' : '✗ Failed:';
    const subject = `[Ballast] ${subjectPrefix} ${title}`;

    const textContent = isPublished
      ? `Your Ballast brief is ready: "${title}"\n\nQuestion: ${question}\n\nView online: ${viewUrl}`
      : `Ballast brief generation failed: "${title}"\n\nQuestion: ${question}\nReason: ${summaryOrError || 'Generation error'}\n\nView status: ${viewUrl}`;

    const htmlContent = renderEmailHtml({
      type,
      title,
      question,
      summaryOrError,
      claimCount,
      viewUrl,
    });

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || 'Ballast <onboarding@resend.dev>';

    // 3. If RESEND_API_KEY is not configured, simulate and exit cleanly (graceful fallback)
    if (!resendApiKey) {
      console.log(
        `[Email Service] RESEND_API_KEY not configured. Simulated email to ${recipientEmails.join(', ')}: "${subject}"`
      );
      return;
    }

    // 4. Dispatch to Resend API
    for (const email of recipientEmails) {
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
          console.warn(`[Email Service Warning] Failed sending to ${email}: HTTP ${res.status} - ${errBody}`);
        } else {
          console.log(`[Email Service] Notification sent successfully to ${email} for brief ${briefId}`);
        }
      } catch (sendErr) {
        console.warn(`[Email Service Warning] Network error sending to ${email}:`, sendErr);
      }
    }
  } catch (err) {
    // Non-blocking catch-all: must never fail the brief
    console.error('[Email Service Error] Failed to process email notifications:', err);
  }
}
