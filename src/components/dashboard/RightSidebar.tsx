'use client';

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Layers,
  FileCheck,
  Lock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Check,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { cleanHtmlAndTracking, humanizeSourceLabel } from '@/lib/formatters';

export interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  brief: any;
  citations: any[];
  runs?: any;
  activeClaimHighlight?: string | null;
  onSelectCitation?: (citation: any) => void;
  onResolveConflict?: (citationId: string, resolutionType: 'confirmed_accurate' | 'dismissed') => Promise<void> | void;
}

export function RightSidebar({
  isOpen,
  onClose,
  brief,
  citations = [],
  runs,
  activeClaimHighlight,
  onSelectCitation,
  onResolveConflict,
}: RightSidebarProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvedMap, setResolvedMap] = useState<Record<string, { status: string; note?: string }>>({});

  const handleResolveConflictAction = async (
    e: React.MouseEvent,
    citationId: string,
    resolutionType: 'confirmed_accurate' | 'dismissed'
  ) => {
    e.stopPropagation();
    if (!citationId) return;

    try {
      setResolvingId(citationId);
      const res = await fetch(`/api/citations/${encodeURIComponent(citationId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionType }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to resolve conflict');
      }

      setResolvedMap((prev) => ({
        ...prev,
        [citationId]: { status: resolutionType },
      }));

      if (onResolveConflict) {
        await onResolveConflict(citationId, resolutionType);
      }
    } catch (err: any) {
      alert(err.message || 'Error resolving conflict');
    } finally {
      setResolvingId(null);
    }
  };

  if (!isOpen) return null;

  /** Format large token numbers into readable short form e.g. 7832 → "~7.8K" */
  function formatTokens(n: number): string {
    if (!n || isNaN(n)) return '0';
    if (n >= 1000) return `~${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  /** Format latency in a friendly way */
  function formatLatency(ms: number): string {
    if (!ms || isNaN(ms)) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <aside className="dash-right-sidebar" style={{ minWidth: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <Layers size={16} color="#10b981" style={{ flexShrink: 0 }} />
          <h2 style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Context Inspector
          </h2>
        </div>
        <button
          onClick={onClose}
          className="dash-icon-btn"
          aria-label="Close context inspector"
          style={{ flexShrink: 0 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Content Scrollable Area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>

        {/* Source Safety Card */}
        <div className="dash-card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={12} color="#10b981" style={{ flexShrink: 0 }} />
              Security Status
            </span>
            <span style={{
              fontSize: '0.65rem',
              fontFamily: 'var(--font-mono)',
              padding: '2px 7px',
              borderRadius: '9999px',
              background: brief ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
              color: brief ? '#34d399' : 'var(--text-muted)',
              border: brief ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--card-border)',
              whiteSpace: 'nowrap',
            }}>
              {brief ? 'Protected ✓' : 'Standby'}
            </span>
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0, wordBreak: 'break-word' }}>
            Your files and emails are kept separate from the AI instructions — Ballast reads your data but never lets it change how it thinks.
          </p>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--card-border)', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ whiteSpace: 'nowrap' }}>Source type:</span>
            <span style={{ color: 'var(--text)', fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0 }}>
              {brief ? (brief.mode === 'world' ? 'Web + Your Files' : 'Your Files Only') : 'None'}
            </span>
          </div>
        </div>

        {/* Citations Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <FileCheck size={15} color="#10b981" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Evidence Citations ({citations.length})
              </span>
            </span>
            <span style={{
              fontSize: '0.62rem',
              fontFamily: 'var(--font-mono)',
              color: '#34d399',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '2px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>Fact-checked</span>
          </div>

          {citations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
              {citations.map((c: any, idx: number) => {
                const resolutionStatus = resolvedMap[c.id]?.status || c.resolution_status || 'unresolved';
                const isConflict = c.citation_type === 'conflict';
                const isConfirmed = isConflict && resolutionStatus === 'confirmed_accurate';
                const isDismissed = isConflict && resolutionStatus === 'dismissed';
                const isUnresolved = isConflict && resolutionStatus === 'unresolved';
                const isResolvingThis = resolvingId === c.id;

                return (
                  <div
                    key={c.id || idx}
                    onClick={() => onSelectCitation && onSelectCitation(c)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: isConfirmed
                        ? 'rgba(16, 185, 129, 0.04)'
                        : isUnresolved
                        ? 'rgba(245, 158, 11, 0.04)'
                        : 'var(--card-bg-subtle)',
                      border: `1px solid ${
                        isConfirmed
                          ? 'rgba(16, 185, 129, 0.35)'
                          : isUnresolved
                          ? 'rgba(245, 158, 11, 0.35)'
                          : 'var(--card-border)'
                      }`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      overflow: 'hidden',
                      minWidth: 0,
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {/* Badge row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      {isConflict ? (
                        isConfirmed ? (
                          <span style={{
                            fontSize: '0.6rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}>
                            <Check size={10} /> Confirmed Authoritative
                          </span>
                        ) : isDismissed ? (
                          <span style={{
                            fontSize: '0.6rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(148, 163, 184, 0.15)',
                            color: 'var(--text-muted)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            Dismissed Discrepancy
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.6rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            ⚠ Discrepancy
                          </span>
                        )
                      ) : (
                        <span style={{
                          fontSize: '0.6rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}>
                          ✓ Confirmed
                        </span>
                      )}

                      <span style={{
                        fontSize: '0.6rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: c.source_class === 'web' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: c.source_class === 'web' ? '#06b6d4' : '#34d399',
                        border: `1px solid ${c.source_class === 'web' ? 'rgba(6,182,212,0.4)' : 'rgba(16,185,129,0.3)'}`,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}>
                        {c.source_class === 'web' ? 'From Web' : 'Your Files'}
                      </span>
                    </div>

                    {/* Quote — clamped to 4 lines with humanized clean text */}
                    <blockquote style={{
                      fontSize: '0.76rem',
                      fontStyle: 'italic',
                      color: 'var(--text)',
                      borderLeft: `2px solid ${isConfirmed ? '#10b981' : isUnresolved ? '#f59e0b' : c.source_class === 'web' ? '#06b6d4' : '#10b981'}`,
                      paddingLeft: '10px',
                      margin: 0,
                      lineHeight: '1.55',
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical' as any,
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}>
                      &ldquo;{cleanHtmlAndTracking(c.quote)}&rdquo;
                    </blockquote>

                    {/* Source label row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', gap: '6px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }} title={c.source_id || 'system'}>
                        {humanizeSourceLabel(c.source_id, c.source_class)}
                      </span>
                      <span style={{ color: isConfirmed ? '#10b981' : '#10b981', fontWeight: 600, flexShrink: 0 }}>
                        {isConfirmed ? 'authoritative memory' : 'grounded'}
                      </span>
                    </div>

                    {/* Conflict Resolution Controls */}
                    {isUnresolved && c.id && (
                      <div
                        style={{
                          marginTop: '4px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px dashed rgba(245, 158, 11, 0.3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>
                          Resolve Conflict:
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            disabled={isResolvingThis}
                            onClick={(e) => handleResolveConflictAction(e, c.id, 'confirmed_accurate')}
                            style={{
                              flex: 1,
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              cursor: isResolvingThis ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            {isResolvingThis ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Check size={11} />
                            )}
                            Confirm Accurate
                          </button>
                          <button
                            disabled={isResolvingThis}
                            onClick={(e) => handleResolveConflictAction(e, c.id, 'dismissed')}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--card-border)',
                              fontSize: '0.68rem',
                              fontWeight: 500,
                              cursor: isResolvingThis ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}

                    {isConfirmed && (
                      <div style={{ fontSize: '0.66rem', color: '#10b981', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sparkles size={11} /> Saved to workspace memory for future briefs
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: '8px', border: '1px dashed var(--card-border)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              No citations attached to this brief.
            </div>
          )}
        </div>

        {/* Generation Stats — human-friendly */}
        {runs ? (
          <div className="dash-card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={13} color="#06b6d4" style={{ flexShrink: 0 }} />
                Generation Stats
              </span>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700 }}>
                ${Number(runs.cost || 0).toFixed(4)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time Taken</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.9rem' }}>{formatLatency(runs.latency_ms)}</span>
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Content Read</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.9rem' }}>{formatTokens(runs.tokens_in)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}> words</span>
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Brief Written</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.9rem' }}>{formatTokens(runs.tokens_out)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem' }}> words</span>
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cost Limit</span>
                <span style={{
                  color: runs.circuit_broken ? '#ef4444' : '#10b981',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}>
                  {runs.circuit_broken
                    ? <><ShieldAlert size={12} /> Reached</>
                    : <><ShieldCheck size={12} /> OK</>
                  }
                </span>
              </div>
            </div>

            {runs.circuit_broken && (
              <div style={{ fontSize: '0.72rem', color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '8px 10px', lineHeight: '1.5', wordBreak: 'break-word' }}>
                Ballast stopped web searching early to stay within budget. The brief uses what it found so far.
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '16px', borderRadius: '8px', border: '1px dashed var(--card-border)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            No generation stats recorded yet.
          </div>
        )}
      </div>
    </aside>
  );
}
