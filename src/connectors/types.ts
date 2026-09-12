import type { ConnectorType } from '@/core/types';

export interface ConnectorHealth {
  connected: boolean;
  last_synced: string | null;
  last_error: string | null;
  sync_window_days: number;
  revoked_at?: string | null;
}

export interface SyncOptions {
  workspaceId: string;
  windowDays?: number;
  maxResults?: number;
  simulateRateLimit?: boolean;
  simulateError?: boolean;
}

export interface SyncItem {
  externalId: string;
  checksum: string;
  date: string;
  subject?: string;
  snippet?: string;
}

export interface FetchedDocument {
  externalId: string;
  content: string;
  checksum: string;
  date: string;
  meta: Record<string, any>;
}

export interface SyncResult {
  syncedCount: number;
  unchangedCount: number;
  windowDays: number;
  durationMs: number;
  error?: string | null;
}

/**
 * Standard connector interface per FR2.8.
 * All source connectors (Gmail, GitHub, Calendar, Web) implement this contract.
 * Adding or updating connectors does not require modifying draft or critic modules.
 */
export interface SourceConnector {
  readonly id: ConnectorType;
  readonly name: string;
  list_changes(options: SyncOptions): Promise<SyncItem[]>;
  fetch(workspaceId: string, externalId: string): Promise<FetchedDocument>;
  sync(options: SyncOptions): Promise<SyncResult>;
  revoke(workspaceId: string): Promise<void>;
  health(workspaceId: string): Promise<ConnectorHealth>;
}
