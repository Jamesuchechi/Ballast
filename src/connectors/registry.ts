import type { ConnectorType } from '@/core/types';
import type { SourceConnector } from './types';
import { gmailConnector } from './gmail';
import { calendarConnector } from './calendar';
import { driveConnector } from './drive';
import { gitHubConnector } from './github';
import { slackConnector } from './slack';
import { notionConnector } from './notion';

export interface ConnectorDefinition {
  id: ConnectorType;
  name: string;
  description: string;
  icon: string;
  authType: 'oauth2' | 'token';
  scopes: string[];
  connector: SourceConnector;
}

/**
 * Standardized Connector Registry for Ballast.
 * Every supported private data source is registered here with its standard SourceConnector instance.
 */
export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Sync email threads, client asks, and operational conversations.',
    icon: 'Mail',
    authType: 'oauth2',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    connector: gmailConnector,
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Sync scheduled milestones, meetings, reviews, and event agendas.',
    icon: 'Calendar',
    authType: 'oauth2',
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    connector: calendarConnector,
  },
  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Sync specs, requirement briefs, docs, and shared spreadsheets.',
    icon: 'HardDrive',
    authType: 'oauth2',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    connector: driveConnector,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Sync repositories, issues, PR discussions, and code review activity.',
    icon: 'GitBranch',
    authType: 'oauth2',
    scopes: ['repo', 'read:org', 'read:user'],
    connector: gitHubConnector,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Sync team discussion channels, decisions, and deployment alerts.',
    icon: 'MessageSquare',
    authType: 'oauth2',
    scopes: ['channels:history', 'channels:read', 'groups:history', 'groups:read'],
    connector: slackConnector,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Sync workspace pages, wikis, roadmaps, and database entries.',
    icon: 'FileText',
    authType: 'token',
    scopes: ['read_content'],
    connector: notionConnector,
  },
];

export function getAllConnectors(): ConnectorDefinition[] {
  return [...CONNECTOR_REGISTRY];
}

export function getConnectorDefinition(id: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.id === id);
}

export function getConnector(id: string): SourceConnector | undefined {
  return getConnectorDefinition(id)?.connector;
}
