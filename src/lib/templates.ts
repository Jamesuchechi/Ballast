/**
 * Brief Templates Library (Feature E15)
 * Comprehensive pre-built question templates for high-signal briefing across
 * Engineering, Leadership, Market Intelligence, and Meeting Preparation.
 */

export type TemplateCategory =
  | 'Engineering & Product'
  | 'Leadership & Status'
  | 'Market & Intelligence'
  | 'Meetings & 1-on-1';

export interface BriefTemplate {
  id: string;
  title: string;
  category: TemplateCategory;
  description: string;
  question: string;
  suggestedMode: 'home' | 'world';
  suggestedCron?: string;
  cronDescription?: string;
  connectors: string[];
  icon: string;
  tags: string[];
}

export const BRIEF_TEMPLATES: BriefTemplate[] = [
  {
    id: 'weekly-team-status',
    title: 'Weekly Team Status & Wins',
    category: 'Leadership & Status',
    description: 'Aggregates key accomplishments, blocker escalations, and cross-team dependencies discussed across Slack, Gmail, and Drive.',
    question: 'What are the key accomplishments, critical blockers, and cross-team dependencies discussed across Slack and emails for this week?',
    suggestedMode: 'home',
    suggestedCron: '0 9 * * 1',
    cronDescription: 'Every Monday at 9:00 AM',
    connectors: ['slack', 'gmail', 'drive'],
    icon: 'Users',
    tags: ['status', 'weekly', 'leadership', 'team'],
  },
  {
    id: 'project-health-check',
    title: 'Project Health & Release Audit',
    category: 'Engineering & Product',
    description: 'Audits active pull requests, open bug regressions, milestone progress, and deployment blockers.',
    question: 'What are the highest priority blocker PRs, outstanding critical issues, and release readiness status across our active projects?',
    suggestedMode: 'home',
    suggestedCron: '0 9 * * 1-5',
    cronDescription: 'Every weekday morning at 9:00 AM',
    connectors: ['github', 'slack'],
    icon: 'Activity',
    tags: ['engineering', 'github', 'prs', 'releases'],
  },
  {
    id: 'competitor-news-scan',
    title: 'Competitor News & Market Scan',
    category: 'Market & Intelligence',
    description: 'Scans live web publications, industry feeds, and competitor announcements relevant to your product domain.',
    question: 'Scan recent market developments, competitor feature releases, and industry announcements relevant to our product domain.',
    suggestedMode: 'world',
    suggestedCron: '0 8 * * 1,4',
    cronDescription: 'Mondays & Thursdays at 8:00 AM',
    connectors: ['web'],
    icon: 'Globe',
    tags: ['market', 'competitors', 'world', 'news'],
  },
  {
    id: 'meeting-prep',
    title: 'Meeting Prep & Stakeholder Brief',
    category: 'Meetings & 1-on-1',
    description: 'Synthesizes recent attendee correspondence, shared docs, and historical action items for upcoming calendar events.',
    question: 'Prepare an executive background briefing, attendee context, recent discussion threads, and key talking points for our upcoming roadmap review.',
    suggestedMode: 'home',
    suggestedCron: '0 8 * * 1-5',
    cronDescription: 'Every weekday at 8:00 AM',
    connectors: ['calendar', 'gmail', 'drive', 'slack'],
    icon: 'Calendar',
    tags: ['meetings', 'calendar', 'prep', 'stakeholders'],
  },
  {
    id: 'incident-postmortem',
    title: 'Incident & Post-Mortem Synthesis',
    category: 'Engineering & Product',
    description: 'Consolidates outage timelines, root causes, mitigating factors, and follow-up remediation items from Slack and GitHub.',
    question: 'Summarize the timeline of events, root cause analysis, affected services, and recommended remediation action items for recent production incidents.',
    suggestedMode: 'home',
    suggestedCron: '0 10 * * 1',
    cronDescription: 'Every Monday at 10:00 AM',
    connectors: ['slack', 'github'],
    icon: 'AlertTriangle',
    tags: ['incident', 'postmortem', 'outage', 'engineering'],
  },
  {
    id: 'executive-daily-standup',
    title: 'Executive Daily Morning Brief',
    category: 'Leadership & Status',
    description: 'Delivers a high-signal morning digest of overnight messages, urgent approvals, and priority decisions for {{today}}.',
    question: 'Summarize high-priority action items, urgent approvals, and overnight team updates requiring leadership attention as of {{today}}.',
    suggestedMode: 'home',
    suggestedCron: '0 8 * * 1-5',
    cronDescription: 'Every weekday at 8:00 AM',
    connectors: ['slack', 'gmail'],
    icon: 'Briefcase',
    tags: ['executive', 'daily', 'standup', 'today'],
  },
  {
    id: 'customer-feedback',
    title: 'Customer Voice & Feature Requests',
    category: 'Market & Intelligence',
    description: 'Extracts recurring user pain points, top-voted feature requests, and customer sentiment from support and sales threads.',
    question: 'What are the most frequent customer pain points, top requested features, and satisfaction sentiment patterns identified in recent customer interactions?',
    suggestedMode: 'home',
    suggestedCron: '0 9 * * 5',
    cronDescription: 'Every Friday at 9:00 AM',
    connectors: ['slack', 'gmail', 'notion'],
    icon: 'MessageSquare',
    tags: ['customer', 'feedback', 'features', 'sales'],
  },
  {
    id: '1-on-1-prep',
    title: '1-on-1 Sync & Career Growth Prep',
    category: 'Meetings & 1-on-1',
    description: 'Prepares growth discussions, reviews recent pull requests/tickets, and highlights unaddressed blockers.',
    question: 'Synthesize recent contributions, feedback loops, project milestones, and open questions to discuss in our next 1-on-1 sync.',
    suggestedMode: 'home',
    suggestedCron: '0 9 * * 3',
    cronDescription: 'Every Wednesday at 9:00 AM',
    connectors: ['github', 'slack', 'notion'],
    icon: 'UserCheck',
    tags: ['1on1', 'career', 'growth', 'sync'],
  },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'Leadership & Status',
  'Engineering & Product',
  'Market & Intelligence',
  'Meetings & 1-on-1',
];

/**
 * Searches and filters brief templates by category, search keyword, and mode.
 */
export function queryTemplates(options?: {
  category?: string;
  search?: string;
  mode?: 'home' | 'world';
}): BriefTemplate[] {
  let filtered = [...BRIEF_TEMPLATES];

  if (options?.category && options.category !== 'all') {
    filtered = filtered.filter(
      (t) => t.category.toLowerCase() === options.category?.toLowerCase()
    );
  }

  if (options?.mode) {
    filtered = filtered.filter((t) => t.suggestedMode === options.mode);
  }

  if (options?.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.question.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }

  return filtered;
}

/**
 * Gets a single template by its unique identifier.
 */
export function getTemplateById(id: string): BriefTemplate | undefined {
  return BRIEF_TEMPLATES.find((t) => t.id === id);
}
