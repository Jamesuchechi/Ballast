import { query } from '@/db/client';

export interface QuestionSuggestion {
  id: string;
  question: string;
  label: string;
  reason: string;
  category: 'follow_up' | 'recency' | 'connector' | 'discovery' | 'world';
  mode: 'home' | 'world';
  sourcesInvolved?: string[];
  icon?: string;
}

export interface SuggestionOptions {
  limit?: number;
  mode?: 'home' | 'world' | 'all';
}

/**
 * Extracts a concise topic label from a brief question.
 */
function extractTopicName(question: string): string {
  let cleaned = question.trim();
  cleaned = cleaned.replace(/^(what (is|are|were)|how (do|does|did|is|are)|summarize|give me|provide|can you explain|show me|list|review)\s+/i, '');
  cleaned = cleaned.replace(/[\?\.\!]+$/, '').trim();

  // If starts with "the status of", clean it
  cleaned = cleaned.replace(/^(the\s+status\s+of\s+|the\s+|a\s+|an\s+)/i, '');

  if (cleaned.length > 40) {
    cleaned = cleaned.slice(0, 37) + '...';
  }
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Deliverables';
}

/**
 * Generates smart question suggestions based on:
 * 1. Stale previous brief history (e.g. "You haven't checked on your Q3 deliverables in 7 days...")
 * 2. Connected workspace integrations & recent ingested sources
 * 3. Cross-connector synergies
 * 4. Contextual World mode compliance and technical research prompts
 */
export async function getSmartQuestionSuggestions(
  workspaceId: string,
  options: SuggestionOptions = {}
): Promise<QuestionSuggestion[]> {
  const { limit = 6, mode = 'all' } = options;
  const suggestions: QuestionSuggestion[] = [];

  // 1. Fetch recent published briefs to identify stale topics and follow-up opportunities
  const recentBriefs = await query<{
    id: string;
    question: string;
    mode: 'home' | 'world';
    published_at: string | null;
    created_at: string;
  }>(
    `SELECT id, question, mode, published_at, created_at 
     FROM briefs 
     WHERE workspace_id = $1 AND status = 'published' 
     ORDER BY COALESCE(published_at, created_at) DESC 
     LIMIT 15`,
    [workspaceId]
  );

  const now = Date.now();
  const seenQuestions = new Set<string>();

  for (const b of recentBriefs) {
    if (seenQuestions.has(b.question.toLowerCase())) continue;
    seenQuestions.add(b.question.toLowerCase());

    const briefTime = new Date(b.published_at || b.created_at).getTime();
    const daysSince = Math.max(1, Math.floor((now - briefTime) / (1000 * 60 * 60 * 24)));
    const topic = extractTopicName(b.question);

    if (daysSince >= 5) {
      suggestions.push({
        id: `followup-${b.id}`,
        question: `You haven't checked on your ${topic.toLowerCase()} in ${daysSince} days — what is the current status and latest updates?`,
        label: `${topic} Status (${daysSince}d stale)`,
        reason: `You haven't checked on this topic in ${daysSince} days`,
        category: 'follow_up',
        mode: b.mode || 'home',
        icon: 'clock',
      });
    } else if (daysSince >= 2) {
      suggestions.push({
        id: `recent-followup-${b.id}`,
        question: `What new developments, decisions, or changes have occurred regarding ${topic.toLowerCase()} since the last brief?`,
        label: `${topic} Follow-up`,
        reason: `Follow up on your recent brief from ${daysSince} days ago`,
        category: 'follow_up',
        mode: b.mode || 'home',
        icon: 'history',
      });
    }
  }

  // 2. Fetch connected tokens & active sources to generate connector-aware questions
  const connectedTokens = await query<{
    connector: string;
    scopes: string[] | null;
  }>(
    `SELECT connector, scopes 
     FROM oauth_tokens 
     WHERE workspace_id = $1 AND revoked_at IS NULL`,
    [workspaceId]
  );

  const activeSources = await query<{
    connector: string;
    meta: Record<string, any>;
    synced_at: string | null;
  }>(
    `SELECT connector, meta, synced_at 
     FROM sources 
     WHERE workspace_id = $1 
     ORDER BY COALESCE(synced_at, created_at) DESC 
     LIMIT 40`,
    [workspaceId]
  );

  const activeConnectors = new Set<string>([
    ...connectedTokens.map((t) => t.connector),
    ...activeSources.map((s) => s.connector),
  ]);

  // Check if calendar is connected
  if (activeConnectors.has('calendar')) {
    const calSources = activeSources.filter((s) => s.connector === 'calendar');
    const sampleEvent = calSources[0]?.meta?.summary || calSources[0]?.meta?.title;

    suggestions.push({
      id: 'connector-calendar-schedule',
      question: sampleEvent
        ? `What key decisions, deliverables, and prep items are required for "${sampleEvent}" and upcoming calendar events?`
        : `What key decisions, deliverables, and prep are needed for upcoming team meetings and calendar events?`,
      label: 'Calendar Meeting Prep',
      reason: `Based on connected Google Calendar (${calSources.length} synced events)`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['calendar'],
      icon: 'calendar',
    });
  }

  // Check if github is connected
  if (activeConnectors.has('github')) {
    const ghSources = activeSources.filter((s) => s.connector === 'github');
    suggestions.push({
      id: 'connector-github-prs',
      question: `What are the latest code changes, open pull requests, and technical deployment blockers in GitHub?`,
      label: 'GitHub PRs & Deployments',
      reason: `Based on connected GitHub repository activity`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['github'],
      icon: 'github',
    });
  }

  // Check if gmail is connected
  if (activeConnectors.has('gmail')) {
    const gmailSources = activeSources.filter((s) => s.connector === 'gmail');
    suggestions.push({
      id: 'connector-gmail-action-items',
      question: `What urgent action items, unread client threads, and pending partner requests require attention in Gmail?`,
      label: 'Gmail Urgent Action Items',
      reason: `Based on connected Gmail inbox communications`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['gmail'],
      icon: 'gmail',
    });
  }

  // Check if drive is connected
  if (activeConnectors.has('drive')) {
    const driveSources = activeSources.filter((s) => s.connector === 'drive');
    const sampleDoc = driveSources[0]?.meta?.name || driveSources[0]?.meta?.title;

    suggestions.push({
      id: 'connector-drive-summary',
      question: sampleDoc
        ? `Summarize the key requirements and outstanding questions in "${sampleDoc}" and recently modified Drive documents.`
        : `What are the key revisions, technical specs, and compliance sign-offs in recently modified Google Drive documents?`,
      label: 'Drive Specs & Compliance',
      reason: `Based on connected Google Drive workspace documents`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['drive'],
      icon: 'drive',
    });
  }

  // Check if slack is connected
  if (activeConnectors.has('slack')) {
    suggestions.push({
      id: 'connector-slack-blockers',
      question: `What decisions, team blockers, and project announcements were discussed across Slack channels recently?`,
      label: 'Slack Team Blockers & Decisions',
      reason: `Based on connected Slack workspace conversations`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['slack'],
      icon: 'slack',
    });
  }

  // Check if notion is connected
  if (activeConnectors.has('notion')) {
    suggestions.push({
      id: 'connector-notion-roadmap',
      question: `What are the current sprint goals, product roadmap milestones, and open tasks tracked in Notion?`,
      label: 'Notion Sprint Roadmap',
      reason: `Based on connected Notion workspaces and database records`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['notion'],
      icon: 'notion',
    });
  }

  // Check if uploaded docs exist
  if (activeConnectors.has('upload')) {
    const uploadSources = activeSources.filter((s) => s.connector === 'upload');
    suggestions.push({
      id: 'connector-upload-evidence',
      question: `Synthesize the primary terms, deliverables, and operational requirements outlined in our uploaded documents.`,
      label: 'Uploaded Documents Audit',
      reason: `Based on ${uploadSources.length} uploaded files in workspace evidence`,
      category: 'connector',
      mode: 'home',
      sourcesInvolved: ['upload'],
      icon: 'upload',
    });
  }

  // 3. Multi-source synergy suggestions when multiple connectors are connected
  if (activeConnectors.has('gmail') && activeConnectors.has('calendar')) {
    suggestions.push({
      id: 'synergy-gmail-calendar',
      question: `Cross-reference recent email conversations with upcoming calendar meetings to identify open questions and preparation notes.`,
      label: 'Email & Calendar Cross-Reference',
      reason: `Multi-source synergy: Gmail + Google Calendar`,
      category: 'recency',
      mode: 'home',
      sourcesInvolved: ['gmail', 'calendar'],
      icon: 'layers',
    });
  }

  if (activeConnectors.has('github') && (activeConnectors.has('drive') || activeConnectors.has('notion'))) {
    suggestions.push({
      id: 'synergy-github-specs',
      question: `Compare recent GitHub pull requests against our specification documents to verify feature completeness.`,
      label: 'Code vs Spec Verification',
      reason: `Multi-source synergy: GitHub + Specifications`,
      category: 'recency',
      mode: 'home',
      sourcesInvolved: ['github', activeConnectors.has('drive') ? 'drive' : 'notion'],
      icon: 'layers',
    });
  }

  // 4. World Mode Questions (External research grounded in industry standards)
  const worldSuggestions: QuestionSuggestion[] = [
    {
      id: 'world-compliance-gdpr',
      question: `What are the official GDPR Article 6 requirements for recurring auto-debit billing consent?`,
      label: 'GDPR Auto-Debit Consent',
      reason: `World Research: Global regulatory compliance standards`,
      category: 'world',
      mode: 'world',
      icon: 'globe',
    },
    {
      id: 'world-stripe-webhooks',
      question: `What are the official Stripe webhook signature verification requirements and replay attack mitigations?`,
      label: 'Stripe Webhook Verification',
      reason: `World Research: Payment provider security architecture`,
      category: 'world',
      mode: 'world',
      icon: 'globe',
    },
    {
      id: 'world-http-rate-limits',
      question: `What are the RFC standards and best practices for HTTP 429 Retry-After exponential backoff?`,
      label: 'HTTP 429 Rate Limiting Best Practices',
      reason: `World Research: Distributed API reliability patterns`,
      category: 'world',
      mode: 'world',
      icon: 'globe',
    },
    {
      id: 'world-soc2-audit-logs',
      question: `What are the SOC 2 Type II compliance requirements for immutable data access and audit logging?`,
      label: 'SOC 2 Access Audit Logging',
      reason: `World Research: Enterprise security & compliance standards`,
      category: 'world',
      mode: 'world',
      icon: 'globe',
    },
  ];

  // 5. Default Starter Suggestions for Brand New Workspaces
  const defaultHomeSuggestions: QuestionSuggestion[] = [
    {
      id: 'default-q3-billing',
      question: `What are the outstanding deliverables and open questions for the Q3 billing revamp?`,
      label: 'Q3 Billing Deliverables',
      reason: `Default starter query for sprint & project tracking`,
      category: 'discovery',
      mode: 'home',
      icon: 'compass',
    },
    {
      id: 'default-merchant-accounts',
      question: `What is the status of the merchant accounts configuration and staging test results?`,
      label: 'Merchant Accounts Status',
      reason: `Default starter query for deployment verification`,
      category: 'discovery',
      mode: 'home',
      icon: 'compass',
    },
    {
      id: 'default-db-migration',
      question: `What database migration scripts and replica dry runs are prepared for production?`,
      label: 'DB Replica Dry Run Status',
      reason: `Default starter query for infrastructure readiness`,
      category: 'discovery',
      mode: 'home',
      icon: 'compass',
    },
  ];

  // Assemble full candidate list based on requested mode
  let candidates: QuestionSuggestion[] = [];

  if (mode === 'world') {
    candidates = [...worldSuggestions, ...suggestions.filter((s) => s.mode === 'world')];
  } else if (mode === 'home') {
    candidates = [
      ...suggestions.filter((s) => s.mode === 'home'),
      ...(suggestions.filter((s) => s.mode === 'home').length < 3 ? defaultHomeSuggestions : []),
    ];
  } else {
    // Mode 'all': blend stale follow-ups, connector queries, multi-source synergies, and top world queries
    candidates = [
      ...suggestions,
      ...worldSuggestions.slice(0, 2),
      ...(suggestions.length < 3 ? defaultHomeSuggestions : []),
    ];
  }

  // Deduplicate by question text
  const finalSet: QuestionSuggestion[] = [];
  const registeredQuestions = new Set<string>();

  for (const cand of candidates) {
    const key = cand.question.toLowerCase().trim();
    if (!registeredQuestions.has(key)) {
      registeredQuestions.add(key);
      finalSet.push(cand);
    }
  }

  return finalSet.slice(0, limit);
}
