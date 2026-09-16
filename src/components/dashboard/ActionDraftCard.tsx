'use client';

import React, { useState } from 'react';
import {
  Mail,
  GitPullRequest,
  MessageSquare,
  CheckSquare,
  FileText,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  User,
  FolderGit2,
} from 'lucide-react';

export interface ActionDraftCardProps {
  act: {
    id: string;
    type: string;
    payload: any;
    brief_question?: string;
    created_at: string;
    approved_at?: string | null;
    executed_at?: string | null;
    error?: string | null;
  };
  onApprove: (actionId: string) => void | Promise<void>;
  disabled?: boolean;
}

export function ActionDraftCard({ act, onApprove, disabled = false }: ActionDraftCardProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const isApproved = !!act.approved_at;
  const isExecuted = !!act.executed_at;
  const hasError = !!act.error;

  // Safe parse payload
  let payload: Record<string, any> = {};
  try {
    if (typeof act.payload === 'string') {
      payload = JSON.parse(act.payload);
    } else if (act.payload && typeof act.payload === 'object') {
      payload = act.payload;
    }
  } catch {
    payload = { text: String(act.payload) };
  }

  // Action type friendly display
  const getActionMeta = (type: string) => {
    switch (type) {
      case 'email_draft':
        return {
          label: 'Email Draft',
          description: 'Draft message ready for review before sending',
          icon: <Mail size={16} color="#38bdf8" />,
          badgeBg: 'rgba(56, 189, 248, 0.15)',
          badgeColor: '#38bdf8',
          badgeBorder: 'rgba(56, 189, 248, 0.3)',
        };
      case 'issue_draft':
        return {
          label: 'Project Issue Draft',
          description: 'Proposed tracker issue ready to publish',
          icon: <GitPullRequest size={16} color="#a855f7" />,
          badgeBg: 'rgba(168, 85, 247, 0.15)',
          badgeColor: '#a855f7',
          badgeBorder: 'rgba(168, 85, 247, 0.3)',
        };
      case 'comment_draft':
        return {
          label: 'Discussion Reply',
          description: 'Proposed response for discussion channel',
          icon: <MessageSquare size={16} color="#f59e0b" />,
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeColor: '#f59e0b',
          badgeBorder: 'rgba(245, 158, 11, 0.3)',
        };
      case 'task':
        return {
          label: 'Follow-up Task',
          description: 'Workspace action item to complete',
          icon: <CheckSquare size={16} color="#10b981" />,
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeColor: '#10b981',
          badgeBorder: 'rgba(16, 185, 129, 0.3)',
        };
      default:
        return {
          label: 'Follow-up Action',
          description: 'System generated recommendation',
          icon: <FileText size={16} color="#94a3b8" />,
          badgeBg: 'rgba(148, 163, 184, 0.15)',
          badgeColor: '#94a3b8',
          badgeBorder: 'rgba(148, 163, 184, 0.3)',
        };
    }
  };

  const meta = getActionMeta(act.type);

  // Extract key fields
  const subject = payload.subject || payload.title;
  const to = payload.to || payload.recipient;
  const body = payload.body || payload.content || payload.comment;
  const summary = payload.summary;
  const repo = payload.repo || payload.repository;
  const isDraftOnly = payload.create_draft_only;

  const handleApproveClick = async () => {
    if (isApproved || disabled || isApproving) return;
    setIsApproving(true);
    try {
      await onApprove(act.id);
    } finally {
      setIsApproving(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="dash-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '20px',
        borderRadius: '12px',
        border: hasError
          ? '1px solid rgba(239, 68, 68, 0.4)'
          : isExecuted
          ? '1px solid rgba(16, 185, 129, 0.3)'
          : '1px solid var(--card-border)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid var(--card-border)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: meta.badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {meta.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: meta.badgeColor,
                  background: meta.badgeBg,
                  border: `1px solid ${meta.badgeBorder}`,
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {meta.label}
              </span>

              {isExecuted && (
                <span className="dash-badge dash-badge-published" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={12} />
                  Sent &amp; Completed
                </span>
              )}

              {isApproved && !isExecuted && (
                <span className="dash-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  Approved &bull; Queued
                </span>
              )}

              {!isApproved && !hasError && (
                <span className="dash-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  Needs Your Review
                </span>
              )}

              {hasError && (
                <span className="dash-badge dash-badge-failed" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} />
                  Needs Attention
                </span>
              )}
            </div>

            {act.brief_question && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                From Brief: <span style={{ color: 'var(--text)' }}>&ldquo;{act.brief_question}&rdquo;</span>
              </p>
            )}
          </div>
        </div>

        {/* Primary Action Button */}
        <div>
          <button
            onClick={handleApproveClick}
            disabled={isApproved || disabled || isApproving}
            className={isApproved ? 'dash-btn-secondary' : 'dash-btn-primary'}
            style={{
              padding: '7px 16px',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isApproved ? 'default' : 'pointer',
            }}
          >
            {isExecuted ? (
              <>
                <Check size={14} />
                <span>Completed</span>
              </>
            ) : isApproved ? (
              <>
                <Check size={14} />
                <span>Approved</span>
              </>
            ) : isApproving ? (
              <span>Approving...</span>
            ) : (
              <>
                <Send size={13} />
                <span>Approve Draft</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Human-Readable Content Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Subject or Title */}
        {subject && (
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Subject / Title
            </span>
            <h4 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text)', margin: '2px 0 0 0', lineHeight: '1.4' }}>
              {subject}
            </h4>
          </div>
        )}

        {/* Recipient / Target / Repo pill */}
        {(to || repo) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {to && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface-hover)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                <User size={12} color="var(--text-muted)" />
                <span style={{ color: 'var(--text-muted)' }}>To:</span>
                <span style={{ fontWeight: 500 }}>{to}</span>
              </div>
            )}

            {repo && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface-hover)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                <FolderGit2 size={12} color="var(--text-muted)" />
                <span style={{ color: 'var(--text-muted)' }}>Repository:</span>
                <span style={{ fontWeight: 500 }}>{repo}</span>
              </div>
            )}

            {isDraftOnly && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'rgba(148, 163, 184, 0.12)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                Save as draft only (won&apos;t auto-send)
              </span>
            )}
          </div>
        )}

        {/* Summary (Human-readable highlight) */}
        {summary && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.06)',
              borderLeft: '3px solid #38bdf8',
              fontSize: '0.85rem',
              color: 'var(--text)',
              lineHeight: '1.5',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '2px' }}>
              Recommended Action
            </div>
            {summary}
          </div>
        )}

        {/* Message / Letter Body */}
        {body && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              background: 'var(--card-bg-subtle)',
              border: '1px solid var(--card-border)',
              fontSize: '0.85rem',
              lineHeight: '1.6',
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {body}
          </div>
        )}

        {/* When no subject, summary or body exists, show clean key-value preview */}
        {!subject && !summary && !body && (
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: 'var(--card-bg-subtle)',
              border: '1px solid var(--card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {Object.entries(payload).map(([k, v]) => (
              <div key={k} style={{ fontSize: '0.8rem', display: 'flex', gap: '8px' }}>
                <strong style={{ color: 'var(--text-muted)', minWidth: '90px' }}>{k}:</strong>
                <span style={{ color: 'var(--text)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Message if any */}
      {hasError && (
        <div
          style={{
            fontSize: '0.78rem',
            color: '#ef4444',
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.08)',
            borderRadius: '6px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={14} />
          <span>
            <strong>Execution Issue:</strong> {act.error}
          </span>
        </div>
      )}

      {/* Card Footer: Metadata and Collapsible Raw JSON */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          paddingTop: '8px',
          borderTop: '1px solid var(--card-border)',
          fontSize: '0.72rem',
          color: 'var(--text-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} />
            Created: {formatDate(act.created_at)}
          </span>
          {act.approved_at && <span>Approved: {formatDate(act.approved_at)}</span>}
          {act.executed_at && <span style={{ color: '#10b981' }}>Completed: {formatDate(act.executed_at)}</span>}
        </div>

        {/* Subtle toggle for technical payload */}
        <button
          type="button"
          onClick={() => setShowRawJson(!showRawJson)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-subtle)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          <span>{showRawJson ? 'Hide Raw Details' : 'View Raw Details'}</span>
          {showRawJson ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Collapsible Raw JSON Box */}
      {showRawJson && (
        <div style={{ marginTop: '2px' }}>
          <pre
            className="dash-code-box"
            style={{
              margin: 0,
              padding: '10px 12px',
              fontSize: '0.72rem',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
