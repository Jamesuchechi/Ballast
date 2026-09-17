import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export interface ConnectorHealthSummary {
  connector: string;
  sourceCount: number;
  chunkCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  status: 'healthy' | 'warning' | 'error' | 'idle';
}

export interface SourceHealthData {
  summary: {
    totalSources: number;
    totalChunks: number;
    activeConnectorsCount: number;
    healthyConnectorsCount: number;
    errorConnectorsCount: number;
    lastSyncedAt: string | null;
    overallStatus: 'healthy' | 'warning' | 'error' | 'idle';
  };
  connectors: ConnectorHealthSummary[];
  recentLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    sourceId: string | null;
    connector: string | null;
    externalId: string | null;
    title: string | null;
  }>;
  sources: Array<{
    id: string;
    externalId: string;
    connector: string;
    checksum: string;
    trustBoundary: string;
    syncWindowStart: string | null;
    syncedAt: string | null;
    fetchedAt: string | null;
    lastError: string | null;
    meta: Record<string, any>;
    createdAt: string;
    chunkCount: number;
  }>;
}

const SUPPORTED_CONNECTORS = [
  'gmail',
  'calendar',
  'drive',
  'github',
  'slack',
  'notion',
  'upload',
  'web',
];

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    // 1. Fetch all sources with chunk counts for the workspace
    const rawSources = await query<{
      id: string;
      external_id: string;
      connector: string;
      checksum: string;
      trust_boundary: string;
      sync_window_start: string | null;
      synced_at: string | null;
      fetched_at: string | null;
      last_error: string | null;
      meta: any;
      created_at: string;
      chunk_count: number;
    }>(
      `SELECT 
         s.id, 
         s.external_id, 
         s.connector, 
         s.checksum, 
         s.trust_boundary, 
         s.sync_window_start,
         s.synced_at,
         s.fetched_at,
         s.last_error,
         s.created_at, 
         s.meta,
         COALESCE(c.chunk_count, 0)::int as chunk_count
       FROM sources s
       LEFT JOIN (
         SELECT source_id, COUNT(*)::int as chunk_count
         FROM chunks
         WHERE workspace_id = $1
         GROUP BY source_id
       ) c ON c.source_id = s.id
       WHERE s.workspace_id = $1
       ORDER BY s.synced_at DESC NULLS LAST, s.created_at DESC`,
      [workspaceId]
    );

    // 2. Aggregate connector metrics
    const connectorStatsMap = new Map<
      string,
      {
        sourceCount: number;
        chunkCount: number;
        lastSyncedAt: string | null;
        lastError: string | null;
      }
    >();

    // Initialize all supported connectors
    for (const conn of SUPPORTED_CONNECTORS) {
      connectorStatsMap.set(conn, {
        sourceCount: 0,
        chunkCount: 0,
        lastSyncedAt: null,
        lastError: null,
      });
    }

    let totalChunks = 0;
    let mostRecentSync: string | null = null;

    for (const src of rawSources) {
      totalChunks += Number(src.chunk_count || 0);

      const existing = connectorStatsMap.get(src.connector) || {
        sourceCount: 0,
        chunkCount: 0,
        lastSyncedAt: null,
        lastError: null,
      };

      existing.sourceCount += 1;
      existing.chunkCount += Number(src.chunk_count || 0);

      if (src.synced_at) {
        if (!existing.lastSyncedAt || new Date(src.synced_at) > new Date(existing.lastSyncedAt)) {
          existing.lastSyncedAt = src.synced_at;
        }
        if (!mostRecentSync || new Date(src.synced_at) > new Date(mostRecentSync)) {
          mostRecentSync = src.synced_at;
        }
      }

      if (src.last_error && !existing.lastError) {
        existing.lastError = src.last_error;
      }

      connectorStatsMap.set(src.connector, existing);
    }

    const connectorSummaries: ConnectorHealthSummary[] = [];
    let errorConnectorsCount = 0;
    let healthyConnectorsCount = 0;
    let activeConnectorsCount = 0;

    for (const [connector, stats] of connectorStatsMap.entries()) {
      let status: 'healthy' | 'warning' | 'error' | 'idle' = 'idle';

      if (stats.lastError) {
        status = 'error';
        errorConnectorsCount += 1;
      } else if (stats.sourceCount > 0) {
        status = 'healthy';
        healthyConnectorsCount += 1;
        activeConnectorsCount += 1;
      } else {
        status = 'idle';
      }

      // Only include active connectors or popular default ones
      connectorSummaries.push({
        connector,
        sourceCount: stats.sourceCount,
        chunkCount: stats.chunkCount,
        lastSyncedAt: stats.lastSyncedAt,
        lastError: stats.lastError,
        status,
      });
    }

    // Determine overall workspace health
    let overallStatus: 'healthy' | 'warning' | 'error' | 'idle' = 'idle';
    if (errorConnectorsCount > 0) {
      overallStatus = 'error';
    } else if (healthyConnectorsCount > 0) {
      overallStatus = 'healthy';
    } else if (rawSources.length > 0) {
      overallStatus = 'healthy';
    }

    // 3. Fetch recent sync & ingestion logs from access_logs
    const rawLogs = await query<{
      id: string;
      action: string;
      created_at: string;
      source_id: string | null;
      connector: string | null;
      external_id: string | null;
      meta: any;
    }>(
      `SELECT 
         al.id,
         al.action,
         al.created_at,
         al.source_id,
         s.connector,
         s.external_id,
         s.meta
       FROM access_logs al
       LEFT JOIN sources s ON s.id = al.source_id
       WHERE al.workspace_id = $1
       ORDER BY al.created_at DESC
       LIMIT 40`,
      [workspaceId]
    );

    const recentLogs = rawLogs.map((log) => {
      let title = log.external_id;
      if (log.meta && typeof log.meta === 'object') {
        title = log.meta.subject || log.meta.filename || log.meta.title || log.meta.name || log.external_id;
      }
      return {
        id: log.id,
        action: log.action,
        createdAt: log.created_at,
        sourceId: log.source_id,
        connector: log.connector,
        externalId: log.external_id,
        title: title || log.source_id || 'System Event',
      };
    });

    const sources = rawSources.map((s) => ({
      id: s.id,
      externalId: s.external_id,
      connector: s.connector,
      checksum: s.checksum,
      trustBoundary: s.trust_boundary,
      syncWindowStart: s.sync_window_start,
      syncedAt: s.synced_at,
      fetchedAt: s.fetched_at,
      lastError: s.last_error,
      meta: s.meta || {},
      createdAt: s.created_at,
      chunkCount: Number(s.chunk_count || 0),
    }));

    return NextResponse.json({
      summary: {
        totalSources: rawSources.length,
        totalChunks,
        activeConnectorsCount,
        healthyConnectorsCount,
        errorConnectorsCount,
        lastSyncedAt: mostRecentSync,
        overallStatus,
      },
      connectors: connectorSummaries,
      recentLogs,
      sources,
    });
  } catch (err: any) {
    console.error('[API /api/sources/health error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch source health data' },
      { status: 500 }
    );
  }
}
