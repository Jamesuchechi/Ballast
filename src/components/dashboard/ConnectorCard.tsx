'use client';

import React from 'react';
import {
  Mail,
  Calendar,
  HardDrive,
  GitBranch,
  MessageSquare,
  FileText,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export interface ConnectorHealth {
  connected: boolean;
  last_synced: string | null;
  last_error: string | null;
  sync_window_days: number;
}

export interface ConnectorItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  authType: 'oauth2' | 'token';
  scopes: string[];
  health: ConnectorHealth;
}

interface ConnectorCardProps {
  connector: ConnectorItem;
  isSyncing: boolean;
  onConnect: (connector: ConnectorItem) => void;
  onSync: (connector: ConnectorItem) => void;
  onRevoke: (connector: ConnectorItem) => void;
}

const BRAND_THEMES: Record<string, { bg: string; color: string; border: string }> = {
  gmail: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.25)' },
  calendar: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)' },
  drive: { bg: 'rgba(234, 179, 8, 0.12)', color: '#eab308', border: 'rgba(234, 179, 8, 0.25)' },
  github: { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.25)' },
  slack: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16, 185, 129, 0.25)' },
  notion: { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.25)' },
};

export function ConnectorCard({
  connector,
  isSyncing,
  onConnect,
  onSync,
  onRevoke,
}: ConnectorCardProps) {
  const brand = BRAND_THEMES[connector.id] || {
    bg: 'rgba(99, 102, 241, 0.12)',
    color: '#818cf8',
    border: 'rgba(99, 102, 241, 0.25)',
  };

  const isConnected = connector.health.connected;
  const hasError = Boolean(connector.health.last_error);

  const renderIcon = () => {
    const props = { size: 20, color: brand.color };
    switch (connector.id) {
      case 'gmail':
        return <Mail {...props} />;
      case 'calendar':
        return <Calendar {...props} />;
      case 'drive':
        return <HardDrive {...props} />;
      case 'github':
        return <GitBranch {...props} />;
      case 'slack':
        return <MessageSquare {...props} />;
      case 'notion':
        return <FileText {...props} />;
      default:
        return <Lock {...props} />;
    }
  };

  const formatLastSynced = (iso: string | null) => {
    if (!iso) return 'Never synced';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Never synced';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className="dash-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '18px',
        gap: '14px',
        border: hasError ? '1px solid rgba(239, 68, 68, 0.35)' : undefined,
        position: 'relative',
      }}
    >
      {/* Top Row: Provider Identity & Status Badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: brand.bg,
              border: `1px solid ${brand.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {renderIcon()}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)' }}>
                {connector.name}
              </h3>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
              {connector.authType === 'oauth2' ? 'OAuth 2.0 (read-only)' : 'API Key / Token'}
            </div>
          </div>
        </div>

        {/* Status Pill */}
        {hasError ? (
          <span
            className="dash-badge dash-badge-failed"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem' }}
          >
            <AlertCircle size={11} />
            <span>Error</span>
          </span>
        ) : isConnected ? (
          <span
            className="dash-badge dash-badge-published"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem' }}
          >
            <CheckCircle2 size={11} />
            <span>Connected</span>
          </span>
        ) : (
          <span
            className="dash-badge dash-badge-mode"
            style={{ fontSize: '0.68rem' }}
          >
            Available
          </span>
        )}
      </div>

      {/* Description */}
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
        {connector.description}
      </p>

      {/* Health & Error Callout */}
      {hasError && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
          }}
        >
          <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.72rem', color: '#fca5a5', lineHeight: '1.4', wordBreak: 'break-word' }}>
            <strong>Sync Error:</strong> {connector.health.last_error}
          </div>
        </div>
      )}

      {/* Metadata Stats Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: 'var(--text-subtle)',
          borderTop: '1px solid var(--card-border)',
          paddingTop: '10px',
          marginTop: 'auto',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {isConnected ? `Synced: ${formatLastSynced(connector.health.last_synced)}` : 'Boundary: Untrusted'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <ShieldCheck size={12} color="#10b981" />
          <span>AES-256</span>
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', paddingTop: '2px' }}>
        {isConnected ? (
          <>
            <button
              onClick={() => onSync(connector)}
              disabled={isSyncing}
              className="dash-btn-primary"
              style={{
                flex: 1,
                justifyContent: 'center',
                padding: '7px 12px',
                fontSize: '0.78rem',
                opacity: isSyncing ? 0.7 : 1,
              }}
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            <button
              onClick={() => onRevoke(connector)}
              className="dash-btn-secondary"
              style={{
                padding: '7px 12px',
                fontSize: '0.78rem',
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              }}
              title="Revoke access and purge active credentials"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => onConnect(connector)}
            className="dash-btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '7px 12px',
              fontSize: '0.78rem',
              background: brand.bg,
              color: brand.color,
              border: `1px solid ${brand.border}`,
            }}
          >
            <span>Connect {connector.name}</span>
          </button>
        )}
      </div>
    </div>
  );
}
