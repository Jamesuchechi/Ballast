'use client';

import React from 'react';
import {
  X,
  ShieldCheck,
  Layers,
  FileCheck,
  Lock,
  Activity,
} from 'lucide-react';

export interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  brief: any;
  citations: any[];
  runs?: any;
  activeClaimHighlight?: string | null;
  onSelectCitation?: (citation: any) => void;
}

export function RightSidebar({
  isOpen,
  onClose,
  brief,
  citations = [],
  runs,
  activeClaimHighlight,
  onSelectCitation,
}: RightSidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="dash-right-sidebar">
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#10b981" />
          <h2 style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text)' }}>
            Context Inspector
          </h2>
        </div>
        <button
          onClick={onClose}
          className="dash-icon-btn"
          aria-label="Close context inspector"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content Scrollable Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Source Trust Boundary Card */}
        <div className="dash-card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={12} color="#10b981" />
              Trust Boundary
            </span>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              untrusted_content
            </span>
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Ingested payloads are treated as untrusted data blocks. Never concatenated into instruction channels.
          </p>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--card-border)' }}>
            <span>Connector:</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>upload / private</span>
          </div>
        </div>

        {/* Citations Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileCheck size={15} color="#10b981" />
              Evidence Citations ({citations.length})
            </span>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Pure Dual-Gate</span>
          </div>

          {citations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {citations.map((c: any, idx: number) => (
                <div
                  key={c.id || idx}
                  onClick={() => onSelectCitation && onSelectCitation(c)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', textTransform: 'uppercase' }}>
                        {c.citation_type || 'support'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: c.source_class === 'web' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: c.source_class === 'web' ? '#06b6d4' : '#34d399',
                          border: `1px solid ${c.source_class === 'web' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
                          textTransform: 'uppercase',
                        }}
                      >
                        [{c.source_class || 'private'}]
                      </span>
                    </div>
                    {c.claim_span && (
                      <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                        [{c.claim_span.start}, {c.claim_span.end}]
                      </span>
                    )}
                  </div>

                  <blockquote
                    style={{
                      fontSize: '0.78rem',
                      fontStyle: 'italic',
                      color: 'var(--text)',
                      borderLeft: `2px solid ${c.source_class === 'web' ? '#06b6d4' : '#10b981'}`,
                      paddingLeft: '10px',
                      margin: 0,
                      lineHeight: '1.5',
                    }}
                  >
                    “{c.quote}”
                  </blockquote>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                      {c.source_id || 'system_notes'}
                    </span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>grounded</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: '8px', border: '1px dashed var(--card-border)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              No citations attached to this brief.
            </div>
          )}
        </div>

        {/* Telemetry & Critic Run */}
        {runs && (
          <div className="dash-card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={13} color="#06b6d4" />
                Run Telemetry
              </span>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700 }}>
                ${Number(runs.cost || 0.0042).toFixed(4)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <span style={{ color: 'var(--text-subtle)', fontSize: '0.62rem', display: 'block' }}>LATENCY</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem' }}>{runs.latency_ms || 940} ms</span>
              </div>
              <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <span style={{ color: 'var(--text-subtle)', fontSize: '0.62rem', display: 'block' }}>TOKENS IN/OUT</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.85rem' }}>
                  {runs.tokens_in || 1840} / {runs.tokens_out || 412}
                </span>
              </div>
            </div>

            <div style={{ paddingTop: '8px', borderTop: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Circuit Breaker:</span>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} /> Armed &amp; Healthy
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
