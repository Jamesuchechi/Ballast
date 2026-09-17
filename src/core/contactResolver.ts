import { query } from '@/db/client';
import { SAMPLE_GMAIL_MESSAGES } from '@/connectors/gmail';
import { SAMPLE_CALENDAR_EVENTS } from '@/connectors/calendar';

export interface ContactInfo {
  name?: string;
  email: string;
  source: 'gmail' | 'calendar' | 'slack' | 'workspace' | 'fixture';
}

/**
 * Parses a raw email string that might be in format "Name <email@domain.com>" or just "email@domain.com".
 */
export function parseEmailString(raw: string): { name?: string; email: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // Format: "Elena Rostova <elena.rostova@legal.corp>"
  const angleMatch = trimmed.match(/^(?:"?([^"<]+)"?\s*)?<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  if (angleMatch) {
    const name = angleMatch[1]?.trim();
    const email = angleMatch[2].toLowerCase().trim();
    return { name: name || undefined, email };
  }

  // Format: "elena.rostova@legal.corp"
  const plainEmailMatch = trimmed.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  if (plainEmailMatch) {
    const email = plainEmailMatch[1].toLowerCase().trim();
    // Derive friendly name if email is firstname.lastname@
    const localPart = email.split('@')[0];
    let derivedName: string | undefined;
    if (localPart.includes('.')) {
      derivedName = localPart
        .split('.')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
    return { name: derivedName, email };
  }

  return null;
}

/**
 * Extracts and aggregates all known contacts from connected sources (Gmail, Calendar, Workspace Members)
 * for a specific workspace.
 */
export async function getWorkspaceContacts(workspaceId: string): Promise<ContactInfo[]> {
  const contactsMap = new Map<string, ContactInfo>();

  // 1. Fetch from database sources (Gmail & Calendar)
  try {
    const sources = await query<{
      connector: string;
      meta: Record<string, any>;
    }>(
      `SELECT connector, meta 
       FROM sources 
       WHERE workspace_id = $1 AND connector IN ('gmail', 'calendar', 'slack')`,
      [workspaceId]
    );

    for (const s of sources) {
      if (s.connector === 'gmail') {
        // From field
        if (s.meta?.from) {
          const parsed = parseEmailString(s.meta.from);
          if (parsed && !contactsMap.has(parsed.email)) {
            contactsMap.set(parsed.email, { ...parsed, source: 'gmail' });
          }
        }
        // Sender field
        if (s.meta?.sender) {
          const parsed = parseEmailString(s.meta.sender);
          if (parsed && !contactsMap.has(parsed.email)) {
            contactsMap.set(parsed.email, { ...parsed, source: 'gmail' });
          }
        }
        // To field (can be array or string)
        if (s.meta?.to) {
          const toList = Array.isArray(s.meta.to) ? s.meta.to : [s.meta.to];
          for (const rawTo of toList) {
            const parsed = parseEmailString(rawTo);
            if (parsed && !contactsMap.has(parsed.email)) {
              contactsMap.set(parsed.email, { ...parsed, source: 'gmail' });
            }
          }
        }
      } else if (s.connector === 'calendar') {
        // Organizer
        if (s.meta?.organizer) {
          const parsed = parseEmailString(s.meta.organizer);
          if (parsed && !contactsMap.has(parsed.email)) {
            contactsMap.set(parsed.email, { ...parsed, source: 'calendar' });
          }
        }
        // Creator
        if (s.meta?.creator) {
          const parsed = parseEmailString(s.meta.creator);
          if (parsed && !contactsMap.has(parsed.email)) {
            contactsMap.set(parsed.email, { ...parsed, source: 'calendar' });
          }
        }
        // Attendees
        if (s.meta?.attendees && Array.isArray(s.meta.attendees)) {
          for (const att of s.meta.attendees) {
            const parsed = parseEmailString(typeof att === 'string' ? att : att?.email || '');
            if (parsed && !contactsMap.has(parsed.email)) {
              contactsMap.set(parsed.email, { ...parsed, source: 'calendar' });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ContactResolver DB Error]:', err);
  }

  // 2. Fetch from workspace members and registered users
  try {
    const members = await query<{
      name: string | null;
      email: string;
    }>(
      `SELECT u.name, u.email 
       FROM workspace_members wm 
       JOIN users u ON u.id = wm.user_id 
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );

    for (const m of members) {
      if (m.email && !contactsMap.has(m.email.toLowerCase())) {
        contactsMap.set(m.email.toLowerCase(), {
          name: m.name || undefined,
          email: m.email.toLowerCase(),
          source: 'workspace',
        });
      }
    }
  } catch (err) {
    console.warn('[ContactResolver Workspace Members Error]:', err);
  }

  // 3. Evaluation & Mock Fallback (when EVAL_USE_MOCK=true or NODE_ENV=test)
  const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
  if (isMockAllowed) {
    for (const msg of SAMPLE_GMAIL_MESSAGES) {
      const parsed = parseEmailString(msg.from);
      if (parsed && !contactsMap.has(parsed.email)) {
        contactsMap.set(parsed.email, { ...parsed, source: 'fixture' });
      }
    }

    for (const ev of SAMPLE_CALENDAR_EVENTS) {
      if (ev.organizer) {
        const parsed = parseEmailString(ev.organizer);
        if (parsed && !contactsMap.has(parsed.email)) {
          contactsMap.set(parsed.email, { ...parsed, source: 'fixture' });
        }
      }
      if (ev.attendees) {
        for (const att of ev.attendees) {
          const parsed = parseEmailString(att);
          if (parsed && !contactsMap.has(parsed.email)) {
            contactsMap.set(parsed.email, { ...parsed, source: 'fixture' });
          }
        }
      }
    }
  }

  return Array.from(contactsMap.values());
}

/**
 * Resolves a query name (e.g. "@Elena", "Elena", "Alex Chen", "alex.chen") to a ContactInfo record.
 */
export function resolveContactEmail(
  queryName: string,
  contacts: ContactInfo[]
): ContactInfo | null {
  if (!queryName || typeof queryName !== 'string') return null;

  // Clean query: remove leading @, quotes, and punctuation
  let cleaned = queryName.trim().replace(/^[@"']+|["']+$/g, '').trim();
  if (!cleaned) return null;

  // 1. If already an explicit email address
  if (cleaned.includes('@') && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned)) {
    const existing = contacts.find((c) => c.email.toLowerCase() === cleaned.toLowerCase());
    if (existing) return existing;
    return {
      email: cleaned.toLowerCase(),
      name: cleaned.split('@')[0],
      source: 'workspace',
    };
  }

  const normalizedQuery = cleaned.toLowerCase();

  // 2. Exact email match
  const exactEmail = contacts.find((c) => c.email.toLowerCase() === normalizedQuery);
  if (exactEmail) return exactEmail;

  // 3. Exact full name match
  const exactName = contacts.find(
    (c) => c.name && c.name.toLowerCase() === normalizedQuery
  );
  if (exactName) return exactName;

  // 4. Email local part match (e.g. "alex.chen" for "alex.chen@acme.corp", or "elena.rostova" for "elena.rostova@legal.corp")
  const localPartMatch = contacts.find((c) => {
    const local = c.email.split('@')[0].toLowerCase();
    return local === normalizedQuery || local.replace(/[._-]/g, ' ') === normalizedQuery;
  });
  if (localPartMatch) return localPartMatch;

  // 5. First name match (e.g. query is "Elena", contact name is "Elena Rostova" or email is "elena.rostova@...")
  const firstNameMatch = contacts.find((c) => {
    if (c.name) {
      const first = c.name.split(' ')[0].toLowerCase();
      if (first === normalizedQuery) return true;
    }
    const localFirst = c.email.split('@')[0].split('.')[0].toLowerCase();
    return localFirst === normalizedQuery;
  });
  if (firstNameMatch) return firstNameMatch;

  // 6. Substring or token match
  const partialMatch = contacts.find((c) => {
    if (c.name && c.name.toLowerCase().includes(normalizedQuery)) return true;
    if (c.email.toLowerCase().includes(normalizedQuery)) return true;
    return false;
  });
  if (partialMatch) return partialMatch;

  return null;
}

/**
 * Extracts potential recipient names or @mentions from an action text string.
 */
export function extractMentionedNames(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const results: string[] = [];

  // Pattern 1: Explicit @mentions (e.g. @Elena, @alex.chen, @elena.rostova)
  const atMatches = text.match(/@([a-zA-Z0-9._-]+)/g);
  if (atMatches) {
    for (const m of atMatches) {
      results.push(m.slice(1));
    }
  }

  // Pattern 2: "email to <Name>", "mail to <Name>", "send email to <Name>", "draft email to <Name>"
  const emailToMatches = text.matchAll(/(?:draft|send|write)?\s*(?:email|mail|message)\s+to\s+(@?[a-zA-Z0-9._-]+(?:\s+[a-zA-Z0-9._-]+)?)/gi);
  for (const m of emailToMatches) {
    let raw = m[1].replace(/^(?:the|a|an)\s+/i, '').trim();
    raw = raw.split(/\s+(?:regarding|about|for|re|with|on|to|at|that|and|or)\b/i)[0].trim();
    if (raw && !['team', 'all', 'everyone', 'someone'].includes(raw.toLowerCase())) {
      results.push(raw);
    }
  }

  // Pattern 3: Key-value "to=<Name>" or "recipient=<Name>"
  const kvMatches = text.matchAll(/\b(?:to|recipient)=(?:"([^"]+)"|'([^']+)'|([^\s,]+))/gi);
  for (const m of kvMatches) {
    const val = m[1] || m[2] || m[3];
    if (val) results.push(val.trim());
  }

  return Array.from(new Set(results));
}
