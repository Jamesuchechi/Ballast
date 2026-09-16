'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Shield,
  Key,
  AlertTriangle,
  UploadCloud,
  Globe,
  Plus,
  X,
  CheckCircle2,
  RefreshCw,
  Clock,
  Download,
  Trash2,
  HardDrive,
} from 'lucide-react';
import { ConnectorCard, ConnectorItem, ConnectorHealth } from './ConnectorCard';
export type { ConnectorItem, ConnectorHealth };

interface IntegrationsMarketplaceProps {
  connectors: ConnectorItem[];
  uploadedCount: number;
  syncingConnectors: Record<string, boolean>;
  onConnect: (connector: ConnectorItem) => void;
  onSync: (connector: ConnectorItem) => void;
  onRevoke: (connector: ConnectorItem) => void;
  onSaveToken: (connectorId: string, token: string) => Promise<void>;
  onNavigateUploads: () => void;
  initialError?: string | null;
  initialMessage?: string | null;
}

export function IntegrationsMarketplace({
  connectors,
  uploadedCount,
  syncingConnectors,
  onConnect,
  onSync,
  onRevoke,
  onSaveToken,
  onNavigateUploads,
  initialError,
  initialMessage,
}: IntegrationsMarketplaceProps) {
  const [filterTab, setFilterTab] = useState<'all' | 'connected' | 'available'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tokenModalConnector, setTokenModalConnector] = useState<ConnectorItem | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const connectedCount = useMemo(
    () => connectors.filter((c) => c.health.connected).length,
    [connectors]
  );

  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      // Tab filter
      if (filterTab === 'connected' && !c.health.connected) return false;
      if (filterTab === 'available' && c.health.connected) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [connectors, filterTab, searchQuery]);

  const handleCardConnect = (connector: ConnectorItem) => {
    if (connector.authType === 'token') {
      setTokenModalConnector(connector);
      setTokenInput('');
      setTokenError(null);
    } else {
      onConnect(connector);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenModalConnector || !tokenInput.trim()) return;

    setIsSubmittingToken(true);
    setTokenError(null);
    try {
      await onSaveToken(tokenModalConnector.id, tokenInput.trim());
      setTokenModalConnector(null);
      setTokenInput('');
    } catch (err: any) {
      setTokenError(err.message || 'Failed to save token');
    } finally {
      setIsSubmittingToken(false);
    }
  };

  // Retention & Compliance State (NFR2.1, NFR2.2)
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [isLoadingRetention, setIsLoadingRetention] = useState(false);
  const [pruningStatus, setPruningStatus] = useState<string | null>(null);
  const [wipeConfirmInput, setWipeConfirmInput] = useState('');
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeMessage, setWipeMessage] = useState<string | null>(null);

  const fetchRetentionPolicies = async () => {
    try {
      setIsLoadingRetention(true);
      const res = await fetch('/api/retention');
      if (res.ok) {
        const data = await res.json();
        if (data.policies) setRetentionPolicies(data.policies);
      }
    } catch (err) {
      console.error('Failed to load retention policies:', err);
    } finally {
      setIsLoadingRetention(false);
    }
  };

  useEffect(() => {
    fetchRetentionPolicies();
  }, []);

  const handleUpdateRetention = async (connector: string, windowDays: number) => {
    try {
      const res = await fetch('/api/retention', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector, windowDays }),
      });
      if (res.ok) {
        await fetchRetentionPolicies();
      }
    } catch (err) {
      console.error('Failed to update retention:', err);
    }
  };

  const handlePruneRetention = async (connector?: string) => {
    try {
      setPruningStatus('Pruning expired sources...');
      const res = await fetch('/api/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector }),
      });
      if (res.ok) {
        const data = await res.json();
        setPruningStatus(data.message || 'Pruning completed');
        await fetchRetentionPolicies();
      }
    } catch (err: any) {
      setPruningStatus(err.message || 'Pruning failed');
    } finally {
      setTimeout(() => setPruningStatus(null), 4000);
    }
  };

  const handleExportData = () => {
    window.location.href = '/api/workspace/export';
  };

  const handleWipeAccount = async () => {
    if (wipeConfirmInput !== 'DELETE_MY_WORKSPACE') return;
    setIsWiping(true);
    setWipeMessage(null);
    try {
      const res = await fetch('/api/workspace/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_MY_WORKSPACE' }),
      });
      if (res.ok) {
        setWipeMessage('Workspace wiped. Redirecting...');
        setTimeout(() => {
          window.location.href = '/';
        }, 1200);
      } else {
        const err = await res.json();
        setWipeMessage(err.error || 'Wipe failed');
      }
    } catch (err: any) {
      setWipeMessage(err.message || 'Wipe failed');
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Top Banner / Marketplace Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', minWidth: 0 }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span className="dash-badge dash-badge-published">Integrations</span>
              <span className="dash-badge dash-badge-mode">All Sources</span>
            </div>
            <h1 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.45rem)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0, wordBreak: 'break-word' }}>
              Connected Sources
            </h1>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5', wordBreak: 'break-word' }}>
              Ballast reads strictly from your connected accounts. Your credentials are encrypted with bank-grade security.
            </p>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              <div style={{ fontSize: '0.78rem', color: 'var(--text)' }}>
                <strong>{connectedCount}</strong> / {connectors.length} Connected
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
              }}
            >
              <Shield size={14} color="#818cf8" />
              <span>AES-256-GCM Vault</span>
            </div>
          </div>
        </div>

        {/* Global Alert / Unconfigured Error Banner if URL carried an error */}
        {initialError && !dismissedBanner && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                <strong>Connection Error:</strong> {initialMessage || initialError}
              </div>
            </div>
            <button
              onClick={() => setDismissedBanner(true)}
              className="dash-icon-btn"
              style={{ color: '#fca5a5' }}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '10px',
          padding: '8px 12px',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        {/* Filter Tabs — scrollable on mobile */}
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', flexShrink: 0, paddingBottom: '1px' }}>
          {(['all', 'connected', 'available'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 500,
                cursor: 'pointer',
                border: 'none',
                whiteSpace: 'nowrap',
                background: filterTab === tab ? 'var(--card-border-hover)' : 'transparent',
                color: filterTab === tab ? 'var(--text)' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === 'all' ? `All (${connectors.length})`
                : tab === 'connected' ? `Connected (${connectedCount})`
                : `Available (${connectors.length - connectedCount})`}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--input-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '6px',
            padding: '4px 10px',
            flex: '1 1 140px',
            minWidth: 0,
          }}
        >
          <Search size={14} color="var(--text-subtle)" />
          <input
            type="text"
            placeholder="Filter integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '0.76rem',
              width: '100%',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <X size={12} color="var(--text-subtle)" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Connectors Grid — responsive single column on mobile */}
      <div
        className="dash-connectors-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          gap: '16px',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        {filteredConnectors.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            isSyncing={Boolean(syncingConnectors[connector.id])}
            onConnect={handleCardConnect}
            onSync={onSync}
            onRevoke={onRevoke}
          />
        ))}
      </div>

      {/* Secondary Native Ingestion Channels (Manual Uploads & Web Snapshots) */}
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '100%', minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Other Ways to Add Content
        </div>

        <div
          className="dash-secondary-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '16px',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          {/* Manual Uploads */}
          <div
            className="dash-card"
            style={{
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 auto' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                    flexShrink: 0,
                  }}
                >
                  <UploadCloud size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)', margin: 0, wordBreak: 'break-word' }}>
                    Manual Uploads &amp; Transcripts
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                    Markdown &bull; PDF &bull; Text &bull; Chunks
                  </div>
                </div>
              </div>
              <span className="dash-badge dash-badge-published" style={{ flexShrink: 0 }}>{uploadedCount} active</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              Drop in your PDFs, docs, and notes. Ballast indexes them so you can ask questions grounded in your own files.
            </p>

            <button
              onClick={onNavigateUploads}
              className="dash-btn-secondary"
              style={{ width: '100%', justifyContent: 'center', padding: '7px 12px', fontSize: '0.78rem' }}
            >
              Manage Uploaded Sources
            </button>
          </div>

          {/* Web Snapshots */}
          <div
            className="dash-card"
            style={{
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 auto' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(6, 182, 212, 0.12)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#06b6d4',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)', margin: 0, wordBreak: 'break-word' }}>
                    Web Snapshots Engine
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                    World Mode &bull; SHA-256 Hashes
                  </div>
                </div>
              </div>
              <span className="dash-badge dash-badge-mode" style={{ flexShrink: 0 }}>Active</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              When you ask a World mode question, Ballast also searches the web and cites live sources alongside your files.
            </p>

            <div
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-subtle)',
                padding: '6px 0',
                wordBreak: 'break-word',
              }}
            >
              Triggered automatically when question mode is set to World
            </div>
          </div>
        </div>
      </div>

      {/* Data Retention Settings */}
      <div
        className="dash-card"
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 200px', minWidth: 0 }}>
            <Clock size={20} color="#818cf8" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', margin: 0, wordBreak: 'break-word' }}>
                Data Retention Settings
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0', lineHeight: '1.5', wordBreak: 'break-word' }}>
                Control how long Ballast keeps data from each source. Old data is automatically deleted.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handlePruneRetention()}
              className="dash-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Trash2 size={13} />
              Prune All Expired
            </button>
            <button
              onClick={handleExportData}
              className="dash-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Download size={13} />
              Export First (JSON)
            </button>
          </div>
        </div>

        {pruningStatus && (
          <div
            style={{
              fontSize: '0.78rem',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '8px 12px',
              borderRadius: '6px',
              wordBreak: 'break-word',
            }}
          >
            {pruningStatus}
          </div>
        )}

        {/* Retention Table — scrollable on mobile */}
        <div
          style={{
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch' as any,
            borderRadius: '8px',
            border: '1px solid var(--card-border)',
          }}
        >
          <table style={{ minWidth: '480px', width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Source Type</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Active Records</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Sync &amp; Retention Window</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {retentionPolicies.map((p) => (
                <tr
                  key={p.connector}
                  style={{ borderBottom: '1px solid var(--card-border)' }}
                >
                  <td style={{ padding: '10px', color: 'var(--text)', fontWeight: 500 }}>
                    <div>{p.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.description}</div>
                  </td>
                  <td style={{ padding: '10px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {p.sourceCount} sources
                  </td>
                  <td style={{ padding: '10px' }}>
                    <select
                      value={p.windowDays}
                      onChange={(e) => handleUpdateRetention(p.connector, parseInt(e.target.value, 10))}
                      style={{
                        background: 'var(--input-bg)',
                        border: '1px solid var(--card-border)',
                        color: 'var(--text)',
                        fontSize: '0.78rem',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        outline: 'none',
                        maxWidth: '100%',
                      }}
                    >
                      <option value={7}>7 Days (Ephemeral)</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days (Rolling month)</option>
                      <option value={60}>60 Days</option>
                      <option value={90}>90 Days (Default)</option>
                      <option value={180}>180 Days</option>
                      <option value={365}>365 Days (1 Year)</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => handlePruneRetention(p.connector)}
                      className="dash-btn-secondary"
                      style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    >
                      Prune {p.connector}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Account Wipe Section */}
        <div
          style={{
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid var(--card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#ef4444', wordBreak: 'break-word' }}>
              Delete All My Data
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.5', wordBreak: 'break-word' }}>
              Server-side wipe permanently destroys all briefs, vector embeddings, chunks, and storage bytes.
              Use <strong>Export First</strong> before proceeding.
            </div>
          </div>
          <button
            onClick={() => {
              setShowWipeModal(true);
              setWipeConfirmInput('');
              setWipeMessage(null);
            }}
            className="dash-btn-secondary"
            style={{
              color: '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              fontSize: '0.78rem',
              padding: '7px 16px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Wipe Account Data
          </button>
        </div>
      </div>

      {/* Wipe Confirmation Modal */}
      {showWipeModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="dash-card"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              border: '1px solid rgba(239, 68, 68, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ef4444', margin: 0 }}>
                  Confirm Permanent Account Wipe
                </h3>
              </div>
              <button
                onClick={() => setShowWipeModal(false)}
                className="dash-icon-btn"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
              This operation is <strong>irreversible</strong> per Closed Decision #2.
              All briefs, citations, embeddings, raw files in storage, schedules, and OAuth tokens will be completely erased.
              No briefs are retained after deletion.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text)', marginBottom: '6px' }}>
                Type <strong>DELETE_MY_WORKSPACE</strong> to confirm:
              </label>
              <input
                type="text"
                placeholder="DELETE_MY_WORKSPACE"
                value={wipeConfirmInput}
                onChange={(e) => setWipeConfirmInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>

            {wipeMessage && (
              <div style={{ fontSize: '0.74rem', color: wipeMessage.includes('Redirecting') ? '#10b981' : '#ef4444' }}>
                {wipeMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowWipeModal(false)}
                className="dash-btn-secondary"
                style={{ padding: '7px 14px', fontSize: '0.78rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={wipeConfirmInput !== 'DELETE_MY_WORKSPACE' || isWiping}
                onClick={handleWipeAccount}
                style={{
                  padding: '7px 16px',
                  fontSize: '0.78rem',
                  background: wipeConfirmInput === 'DELETE_MY_WORKSPACE' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: wipeConfirmInput === 'DELETE_MY_WORKSPACE' ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                }}
              >
                {isWiping ? 'Wiping Everything...' : 'Wipe All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notion / Token Configuration Modal */}
      {tokenModalConnector && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="dash-card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="#818cf8" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  Connect {tokenModalConnector.name}
                </h3>
              </div>
              <button
                onClick={() => setTokenModalConnector(null)}
                className="dash-icon-btn"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
              Enter your {tokenModalConnector.name} Internal Integration Token or API Key. Tokens will be encrypted
              using AES-256-GCM before storage.
            </p>

            <form onSubmit={handleTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Integration Secret Token
                </label>
                <input
                  type="password"
                  placeholder="secret_..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>

              {tokenError && (
                <div style={{ fontSize: '0.74rem', color: '#ef4444' }}>
                  {tokenError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setTokenModalConnector(null)}
                  className="dash-btn-secondary"
                  style={{ padding: '7px 14px', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingToken}
                  className="dash-btn-primary"
                  style={{ padding: '7px 16px', fontSize: '0.78rem' }}
                >
                  {isSubmittingToken ? 'Encrypting & Saving...' : 'Save Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
