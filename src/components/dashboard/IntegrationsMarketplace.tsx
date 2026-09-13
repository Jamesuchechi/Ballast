'use client';

import React, { useState, useMemo } from 'react';
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

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Banner / Marketplace Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="dash-badge dash-badge-published">Integrations Marketplace</span>
              <span className="dash-badge dash-badge-mode">Phase B &amp; E Standard</span>
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              Connected Sources &amp; Knowledge Ingestion
            </h1>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '650px' }}>
              Ballast retrieves ground-truth evidence strictly from connected sources. All OAuth credentials and tokens
              are encrypted at rest using AES-256-GCM.
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
          gap: '12px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '10px',
          padding: '8px 12px',
        }}
      >
        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setFilterTab('all')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              background: filterTab === 'all' ? 'var(--card-border-hover)' : 'transparent',
              color: filterTab === 'all' ? 'var(--text)' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            All ({connectors.length})
          </button>
          <button
            onClick={() => setFilterTab('connected')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              background: filterTab === 'connected' ? 'var(--card-border-hover)' : 'transparent',
              color: filterTab === 'connected' ? 'var(--text)' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Connected ({connectedCount})
          </button>
          <button
            onClick={() => setFilterTab('available')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              background: filterTab === 'available' ? 'var(--card-border-hover)' : 'transparent',
              color: filterTab === 'available' ? 'var(--text)' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Available ({connectors.length - connectedCount})
          </button>
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
            minWidth: '220px',
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

      {/* Primary Connectors Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
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
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Native Workspace Channels
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {/* Manual Uploads */}
          <div
            className="dash-card"
            style={{
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                  }}
                >
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    Manual Uploads &amp; Transcripts
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                    Markdown &bull; PDF &bull; Text &bull; Chunks
                  </div>
                </div>
              </div>
              <span className="dash-badge dash-badge-published">{uploadedCount} active</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
              Direct file drop for project roadmaps, private architecture specs, and team transcripts with 1536-dim pgvector indexing.
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
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                  }}
                >
                  <Globe size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    Web Snapshots Engine
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                    World Mode &bull; SHA-256 Hashes
                  </div>
                </div>
              </div>
              <span className="dash-badge dash-badge-mode">Active</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
              Dynamically searches public documentation and web articles during World Mode generation with verbatim URI citations.
            </p>

            <div
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-subtle)',
                padding: '6px 0',
              }}
            >
              Triggered automatically when question mode is set to World
            </div>
          </div>
        </div>
      </div>

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
