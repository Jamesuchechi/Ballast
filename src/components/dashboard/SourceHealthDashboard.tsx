'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Database,
  Layers,
  Clock,
  ExternalLink,
  ShieldCheck,
  Search,
  Filter,
  FileText,
  Mail,
  Calendar as CalendarIcon,
  HardDrive,
  GitBranch,
  MessageSquare,
  Globe,
  UploadCloud,
  ChevronRight,
  Info,
  Trash2,
  Eye,
  AlertOctagon,
  Sparkles,
  Shield,
} from 'lucide-react';
import { SourceHealthData, ConnectorHealthSummary } from '@/app/api/sources/health/route';

interface SourceHealthDashboardProps {
  onNavigateMarketplace?: () => void;
  onSyncConnector?: (connectorName: string) => Promise<void> | void;
}

export function SourceHealthDashboard({
  onNavigateMarketplace,
  onSyncConnector,
}: SourceHealthDashboardProps) {
  const [data, setData] = useState<SourceHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});

  // Filtering for sources table
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConnector, setSelectedConnector] = useState<string>('all');
  const [errorOnlyFilter, setErrorOnlyFilter] = useState<boolean>(false);

  // Chunk inspection modal state
  const [inspectSourceId, setInspectSourceId] = useState<string | null>(null);
  const [inspectSourceTitle, setInspectSourceTitle] = useState<string>('');
  const [inspectChunks, setInspectChunks] = useState<Array<{ id: string; ordinal: number; text: string; created_at: string }>>([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  const fetchHealthData = async () => {
    try {
      setError(null);
      const res = await fetch('/api/sources/health');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const json: SourceHealthData = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Failed to load source health data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHealthData();
  };

  const handleSync = async (connectorName: string) => {
    try {
      setSyncingMap((prev) => ({ ...prev, [connectorName]: true }));
      if (onSyncConnector) {
        await onSyncConnector(connectorName);
      } else {
        // Fallback direct trigger via connectors API if available
        await fetch(`/api/connectors/${connectorName}/sync`, { method: 'POST' }).catch(() => {});
      }
      // Re-fetch health data after sync trigger
      setTimeout(() => {
        fetchHealthData();
      }, 1500);
    } finally {
      setSyncingMap((prev) => ({ ...prev, [connectorName]: false }));
    }
  };

  const handleInspectChunks = async (sourceId: string, title: string) => {
    try {
      setInspectSourceId(sourceId);
      setInspectSourceTitle(title);
      setInspectLoading(true);
      const res = await fetch(`/api/sources?id=${encodeURIComponent(sourceId)}`);
      if (res.ok) {
        const resData = await res.json();
        setInspectChunks(resData.chunks || []);
      } else {
        setInspectChunks([]);
      }
    } catch (e) {
      console.error('Failed to load chunks:', e);
      setInspectChunks([]);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!window.confirm('Are you sure you want to delete this source and purge all its indexed vector chunks?')) {
      return;
    }
    try {
      const res = await fetch(`/api/sources?id=${encodeURIComponent(sourceId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchHealthData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || 'Failed to delete source');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to delete source');
    }
  };

  const [updatingTrustMap, setUpdatingTrustMap] = useState<Record<string, boolean>>({});

  const handleToggleTrustBoundary = async (sourceId: string, currentTrust: string) => {
    const newTrust = currentTrust === 'verified' ? 'untrusted_content' : 'verified';
    try {
      setUpdatingTrustMap((prev) => ({ ...prev, [sourceId]: true }));
      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sources: prev.sources.map((s) =>
            s.id === sourceId ? { ...s, trustBoundary: newTrust } : s
          ),
        };
      });

      const res = await fetch(`/api/sources/${sourceId}/trust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustBoundary: newTrust }),
      });

      if (!res.ok) {
        // Rollback on failure
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sources: prev.sources.map((s) =>
              s.id === sourceId ? { ...s, trustBoundary: currentTrust } : s
            ),
          };
        });
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || 'Failed to update trust boundary');
      }
    } catch (e: any) {
      alert(e.message || 'Error updating trust boundary');
    } finally {
      setUpdatingTrustMap((prev) => ({ ...prev, [sourceId]: false }));
    }
  };


  const getConnectorIcon = (connector: string) => {
    switch (connector.toLowerCase()) {
      case 'gmail':
        return <Mail size={18} color="#ef4444" />;
      case 'calendar':
        return <CalendarIcon size={18} color="#3b82f6" />;
      case 'drive':
        return <HardDrive size={18} color="#10b981" />;
      case 'github':
        return <GitBranch size={18} color="#a855f7" />;
      case 'slack':
        return <MessageSquare size={18} color="#eab308" />;
      case 'notion':
        return <FileText size={18} color="#6366f1" />;
      case 'upload':
        return <UploadCloud size={18} color="#06b6d4" />;
      case 'web':
        return <Globe size={18} color="#14b8a6" />;
      default:
        return <Database size={18} color="var(--accent)" />;
    }
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Filter sources
  const filteredSources = useMemo(() => {
    if (!data?.sources) return [];
    return data.sources.filter((s) => {
      if (selectedConnector !== 'all' && s.connector !== selectedConnector) {
        return false;
      }
      if (errorOnlyFilter && !s.lastError) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const extId = s.externalId?.toLowerCase() || '';
        const metaStr = JSON.stringify(s.meta || {}).toLowerCase();
        const conn = s.connector.toLowerCase();
        return extId.includes(q) || metaStr.includes(q) || conn.includes(q);
      }
      return true;
    });
  }, [data?.sources, selectedConnector, errorOnlyFilter, searchQuery]);

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ fontSize: '0.9rem' }}>Loading Source Health telemetry...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="dash-card"
        style={{
          padding: '32px',
          textAlign: 'center',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.04)',
        }}
      >
        <AlertOctagon size={36} color="#ef4444" style={{ margin: '0 auto 12px auto' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
          Failed to load Source Health Dashboard
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '8px 0 20px 0' }}>
          {error || 'An unexpected error occurred while querying source telemetry.'}
        </p>
        <button
          onClick={handleRefresh}
          className="btn-primary"
          style={{ padding: '8px 18px', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} style={{ marginRight: '6px' }} /> Retry
        </button>
      </div>
    );
  }

  const { summary, connectors, recentLogs } = data;
  const activeConnectors = connectors.filter((c) => c.sourceCount > 0 || c.lastError);
  const idleConnectors = connectors.filter((c) => c.sourceCount === 0 && !c.lastError);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={22} color="var(--accent)" />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
              Source Health & Indexing Dashboard
            </h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Live visibility into connected sources, vector chunk indices, sync freshness, and error diagnostics.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--card-border)',
              background: 'var(--card-bg)',
              color: 'var(--text)',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            Refresh Telemetry
          </button>

          {onNavigateMarketplace && (
            <button
              onClick={onNavigateMarketplace}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '0.82rem',
                fontWeight: 500,
              }}
            >
              <ExternalLink size={14} />
              Connectors Marketplace
            </button>
          )}
        </div>
      </div>

      {/* Top KPI Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Metric 1: System Status */}
        <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              System Health
            </span>
            {summary.overallStatus === 'error' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                <XCircle size={12} /> {summary.errorConnectorsCount} Error{summary.errorConnectorsCount > 1 ? 's' : ''}
              </span>
            ) : summary.overallStatus === 'healthy' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                <CheckCircle2 size={12} /> Operational
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--card-bg-subtle)', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>
                Idle
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)' }}>
            {summary.healthyConnectorsCount} / {summary.activeConnectorsCount || connectors.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Healthy Active Connectors
          </span>
        </div>

        {/* Metric 2: Total Sources */}
        <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Ingested Sources
            </span>
            <Database size={16} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)' }}>
            {summary.totalSources}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Distinct files, emails & events
          </span>
        </div>

        {/* Metric 3: Vector Chunks */}
        <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Indexed Chunks
            </span>
            <Layers size={16} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)' }}>
            {summary.totalChunks}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {summary.totalSources > 0
              ? `~${(summary.totalChunks / summary.totalSources).toFixed(1)} chunks/source`
              : 'Vector embeddings ready'}
          </span>
        </div>

        {/* Metric 4: Latest Sync */}
        <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Latest Sync
            </span>
            <Clock size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatRelativeTime(summary.lastSyncedAt)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {summary.lastSyncedAt ? new Date(summary.lastSyncedAt).toLocaleTimeString() : 'Awaiting initial sync'}
          </span>
        </div>
      </div>

      {/* Per-Connector Status Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
            Connected Services Health
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {activeConnectors.length} active integration{activeConnectors.length === 1 ? '' : 's'}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '14px',
          }}
        >
          {connectors.map((c) => {
            const isSyncing = syncingMap[c.connector] || false;
            const hasError = !!c.lastError;
            const hasData = c.sourceCount > 0;

            return (
              <div
                key={c.connector}
                className="dash-card"
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  borderLeft: hasError
                    ? '4px solid #ef4444'
                    : hasData
                    ? '4px solid #10b981'
                    : '4px solid var(--card-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'var(--card-bg-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--card-border)',
                      }}
                    >
                      {getConnectorIcon(c.connector)}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                        {c.connector}
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Last synced: {formatRelativeTime(c.lastSyncedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Status Pill */}
                  {hasError ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#ef4444',
                        background: 'rgba(239, 68, 68, 0.12)',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlertTriangle size={12} /> Sync Error
                    </span>
                  ) : hasData ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.12)',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} /> Healthy
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        background: 'var(--card-bg-subtle)',
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      Not Configured
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    fontSize: '0.78rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Sources: </span>
                    <strong style={{ color: 'var(--text)' }}>{c.sourceCount}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Chunks: </span>
                    <strong style={{ color: 'var(--text)' }}>{c.chunkCount}</strong>
                  </div>
                </div>

                {/* Error Banner if any */}
                {hasError && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      fontSize: '0.75rem',
                      color: '#ef4444',
                      wordBreak: 'break-word',
                    }}
                  >
                    <strong>Last Error:</strong> {c.lastError}
                  </div>
                )}

                {/* Action Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: 'auto' }}>
                  <button
                    onClick={() => {
                      setSelectedConnector(c.connector);
                    }}
                    style={{
                      fontSize: '0.74rem',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--card-border)',
                      background: 'transparent',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    View Sources
                  </button>
                  {hasData && (
                    <button
                      onClick={() => handleSync(c.connector)}
                      disabled={isSyncing}
                      style={{
                        fontSize: '0.74rem',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--accent)',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: 'var(--accent)',
                        fontWeight: 600,
                        cursor: isSyncing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RefreshCw size={11} className={isSyncing ? 'spin' : ''} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Ingestion & Sync Audit Trail (Access Logs) */}
      <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#10b981" />
              Recent Knowledge Ingestion & Sync Activity
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Immutable audit events emitted during source reads, vector indexing, and pipeline retrievals.
            </p>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing latest {recentLogs.length} events
          </span>
        </div>

        {recentLogs.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            No ingestion or sync activity recorded yet. Events will appear here once sources are connected or briefs run.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '260px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {recentLogs.map((log) => {
              const isError = log.action.includes('error') || log.action.includes('fail');
              const isSync = log.action.includes('sync') || log.action.includes('fetch');
              const isIngest = log.action.includes('ingest') || log.action.includes('chunk');

              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    fontSize: '0.78rem',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {log.connector ? (
                      getConnectorIcon(log.connector)
                    ) : (
                      <Activity size={16} color="var(--text-muted)" />
                    )}
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isError
                          ? 'rgba(239, 68, 68, 0.15)'
                          : isSync
                          ? 'rgba(59, 130, 246, 0.15)'
                          : isIngest
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(168, 85, 247, 0.15)',
                        color: isError
                          ? '#ef4444'
                          : isSync
                          ? '#60a5fa'
                          : isIngest
                          ? '#34d399'
                          : '#c084fc',
                        flexShrink: 0,
                      }}
                    >
                      {log.action}
                    </span>
                    <span
                      style={{
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={log.title || undefined}
                    >
                      {log.title}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detailed Indexed Sources & Chunk Inspection Table */}
      <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
              Indexed Source Records & Chunks ({filteredSources.length})
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Inspect chunk density, trust boundary classifications, and individual source sync status.
            </p>
          </div>

          {/* Controls: Search, Connector Filter, Error Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Search sources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 10px 6px 30px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg-subtle)',
                  color: 'var(--text)',
                  fontSize: '0.78rem',
                  width: '180px',
                }}
              />
            </div>

            <select
              value={selectedConnector}
              onChange={(e) => setSelectedConnector(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--card-border)',
                background: 'var(--card-bg-subtle)',
                color: 'var(--text)',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Connectors</option>
              <option value="gmail">Gmail</option>
              <option value="calendar">Calendar</option>
              <option value="drive">Google Drive</option>
              <option value="github">GitHub</option>
              <option value="slack">Slack</option>
              <option value="notion">Notion</option>
              <option value="upload">Uploaded Files</option>
              <option value="web">Web Sources</option>
            </select>

            <button
              onClick={() => setErrorOnlyFilter(!errorOnlyFilter)}
              style={{
                fontSize: '0.75rem',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--card-border)',
                background: errorOnlyFilter ? 'rgba(239, 68, 68, 0.15)' : 'var(--card-bg-subtle)',
                color: errorOnlyFilter ? '#ef4444' : 'var(--text-muted)',
                fontWeight: errorOnlyFilter ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              Errors Only
            </button>
          </div>
        </div>

        {filteredSources.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No sources match the selected filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Source / Document</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Connector</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Trust Boundary</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Chunks</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Last Sync</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map((s) => {
                  let title = s.externalId;
                  if (s.meta && typeof s.meta === 'object') {
                    title = s.meta.subject || s.meta.filename || s.meta.title || s.meta.name || s.externalId;
                  }

                  const hasError = !!s.lastError;

                  return (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--card-border)',
                        transition: 'background 0.15s ease',
                      }}
                      className="source-table-row"
                    >
                      <td style={{ padding: '10px 12px', maxWidth: '260px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>
                          {title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.externalId}
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {getConnectorIcon(s.connector)}
                          <span style={{ textTransform: 'capitalize', color: 'var(--text)' }}>
                            {s.connector}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleTrustBoundary(s.id, s.trustBoundary)}
                          disabled={updatingTrustMap[s.id]}
                          title={
                            s.trustBoundary === 'verified'
                              ? 'Verified Authoritative Internal Source (Critic prioritizes over untrusted sources in conflicts). Click to change to Untrusted.'
                              : 'Untrusted Content (Standard external or third-party source). Click to upgrade to Verified.'
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: s.trustBoundary === 'verified' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                            color: s.trustBoundary === 'verified' ? '#10b981' : '#f59e0b',
                            border: `1px solid ${s.trustBoundary === 'verified' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Shield size={11} color={s.trustBoundary === 'verified' ? '#10b981' : '#f59e0b'} />
                          <span>{s.trustBoundary === 'verified' ? 'Verified Doc' : 'Untrusted'}</span>
                        </button>
                      </td>

                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: s.chunkCount > 0 ? 'rgba(139, 92, 246, 0.12)' : 'var(--card-bg-subtle)',
                            color: s.chunkCount > 0 ? '#8b5cf6' : 'var(--text-muted)',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                          }}
                        >
                          <Layers size={11} /> {s.chunkCount}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {formatRelativeTime(s.syncedAt)}
                      </td>

                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {hasError ? (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: '#ef4444',
                              background: 'rgba(239, 68, 68, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={s.lastError || undefined}
                          >
                            <AlertTriangle size={11} /> Error
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: '#10b981',
                              background: 'rgba(16, 185, 129, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CheckCircle2 size={11} /> Synced
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleInspectChunks(s.id, title)}
                            title="Inspect Vector Chunks"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--card-border)',
                              background: 'var(--card-bg-subtle)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                            }}
                          >
                            <Eye size={12} /> Chunks
                          </button>

                          <button
                            onClick={() => handleDeleteSource(s.id)}
                            title="Delete Source and Purge Chunks"
                            style={{
                              padding: '4px 6px',
                              borderRadius: '4px',
                              border: '1px solid var(--card-border)',
                              background: 'transparent',
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunk Inspection Modal */}
      {inspectSourceId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setInspectSourceId(null)}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--card-bg)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--card-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} color="var(--accent)" />
                  Indexed Vector Chunks
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', wordBreak: 'break-all' }}>
                  {inspectSourceTitle}
                </p>
              </div>
              <button
                onClick={() => setInspectSourceId(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {inspectLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px auto' }} />
                  <p style={{ fontSize: '0.85rem' }}>Loading vector chunks...</p>
                </div>
              ) : inspectChunks.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No vector chunks found for this source.
                </div>
              ) : (
                inspectChunks.map((chunk, idx) => (
                  <div
                    key={chunk.id || idx}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'var(--card-bg-subtle)',
                      border: '1px solid var(--card-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                        Chunk #{chunk.ordinal + 1}
                      </span>
                      <span>{chunk.text.length} chars</span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text)',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                      }}
                    >
                      {chunk.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--card-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'var(--card-bg-subtle)',
              }}
            >
              <button
                onClick={() => setInspectSourceId(null)}
                className="btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
