'use client';

import React, { useState } from 'react';
import { GitBranch, X, CheckCircle2, ArrowRight, Layers, FileText, Minus, Plus } from 'lucide-react';
import type { BriefDiffResult } from '@/core/diff';

interface BriefDiffModalProps {
  diff: BriefDiffResult;
  onClose: () => void;
}

export function BriefDiffModal({ diff, onClose }: BriefDiffModalProps) {
  const [activeDiffTab, setActiveDiffTab] = useState<'claims' | 'answer' | 'markdown'>('claims');

  return (
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
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          gap: '16px',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={18} color="#818cf8" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Brief Revision Diff (FR6.2)
              </h3>
              <span className="dash-badge dash-badge-mode">Same Version Lineage</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Comparing <strong>{diff.fromBrief.id.slice(0, 8)}</strong> ({new Date(diff.fromBrief.asOf).toLocaleDateString()}) &rarr; <strong>{diff.toBrief.id.slice(0, 8)}</strong> ({new Date(diff.toBrief.asOf).toLocaleDateString()})
            </p>
          </div>

          <button onClick={onClose} className="dash-icon-btn" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Quick Stats Bar */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>
            +{diff.stats.totalAdditions} Lines Added
          </div>
          <div style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', fontSize: '0.78rem', fontWeight: 600 }}>
            -{diff.stats.totalDeletions} Lines Removed
          </div>
          <div style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--card-border)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            {diff.evidenceClaimDiff.addedClaims.length} New Claims
          </div>
          <div style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--card-border)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            {diff.evidenceClaimDiff.removedClaims.length} Dropped Claims
          </div>
        </div>

        {/* Diff Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
          <button
            onClick={() => setActiveDiffTab('claims')}
            className={`dash-btn-secondary ${activeDiffTab === 'claims' ? 'is-active' : ''}`}
            style={{ fontSize: '0.78rem', padding: '5px 12px', borderColor: activeDiffTab === 'claims' ? '#818cf8' : undefined }}
          >
            Claim Evolution
          </button>
          <button
            onClick={() => setActiveDiffTab('answer')}
            className={`dash-btn-secondary ${activeDiffTab === 'answer' ? 'is-active' : ''}`}
            style={{ fontSize: '0.78rem', padding: '5px 12px', borderColor: activeDiffTab === 'answer' ? '#818cf8' : undefined }}
          >
            Answer Diff
          </button>
          <button
            onClick={() => setActiveDiffTab('markdown')}
            className={`dash-btn-secondary ${activeDiffTab === 'markdown' ? 'is-active' : ''}`}
            style={{ fontSize: '0.78rem', padding: '5px 12px', borderColor: activeDiffTab === 'markdown' ? '#818cf8' : undefined }}
          >
            Unified Markdown
          </button>
        </div>

        {/* Tab Content */}
        {activeDiffTab === 'claims' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Added Claims */}
            {diff.evidenceClaimDiff.addedClaims.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={14} />
                  New Verified Claims Added in this Revision ({diff.evidenceClaimDiff.addedClaims.length}):
                </div>
                {diff.evidenceClaimDiff.addedClaims.map((claim, idx) => (
                  <div key={idx} style={{ fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.08)', borderLeft: '3px solid #10b981', borderRadius: '4px', color: 'var(--text)' }}>
                    {claim}
                  </div>
                ))}
              </div>
            )}

            {/* Dropped Claims */}
            {diff.evidenceClaimDiff.removedClaims.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Minus size={14} />
                  Claims Dropped or Superseded ({diff.evidenceClaimDiff.removedClaims.length}):
                </div>
                {diff.evidenceClaimDiff.removedClaims.map((claim, idx) => (
                  <div key={idx} style={{ fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', borderLeft: '3px solid #ef4444', borderRadius: '4px', color: 'var(--text-muted)' }}>
                    {claim}
                  </div>
                ))}
              </div>
            )}

            {/* Retained Claims */}
            {diff.evidenceClaimDiff.retainedClaims.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Unchanged Grounded Claims ({diff.evidenceClaimDiff.retainedClaims.length}):
                </div>
                {diff.evidenceClaimDiff.retainedClaims.slice(0, 5).map((claim, idx) => (
                  <div key={idx} style={{ fontSize: '0.76rem', padding: '6px 10px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '4px', color: 'var(--text-muted)' }}>
                    {claim}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeDiffTab === 'answer' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: '#000000', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '14px', lineHeight: '1.7', overflowX: 'auto' }}>
            {diff.answerDiff.map((line, idx) => {
              if (line.type === 'add') {
                return (
                  <div key={idx} style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 4px' }}>
                    + {line.text}
                  </div>
                );
              }
              if (line.type === 'del') {
                return (
                  <div key={idx} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '1px 4px' }}>
                    - {line.text}
                  </div>
                );
              }
              return (
                <div key={idx} style={{ color: '#cbd5e1' }}>
                  &nbsp; {line.text}
                </div>
              );
            })}
          </div>
        )}

        {activeDiffTab === 'markdown' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: '#000000', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '14px', lineHeight: '1.7', maxHeight: '500px', overflowY: 'auto' }}>
            {diff.unifiedMarkdownDiff.map((line, idx) => {
              if (line.type === 'add') {
                return (
                  <div key={idx} style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 4px' }}>
                    + {line.text}
                  </div>
                );
              }
              if (line.type === 'del') {
                return (
                  <div key={idx} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '1px 4px' }}>
                    - {line.text}
                  </div>
                );
              }
              return (
                <div key={idx} style={{ color: '#cbd5e1' }}>
                  &nbsp; {line.text}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--card-border)' }}>
          <button onClick={onClose} className="dash-btn-secondary" style={{ padding: '7px 16px', fontSize: '0.8rem' }}>
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
