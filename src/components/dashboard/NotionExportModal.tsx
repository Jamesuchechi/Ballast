'use client';

import React, { useState } from 'react';
import { FileText, X, Copy, Check, ExternalLink, Sparkles, Loader2, AlertCircle, Database, Layers } from 'lucide-react';

interface NotionExportModalProps {
  briefId: string;
  briefTitle: string;
  onClose: () => void;
}

export function NotionExportModal({ briefId, briefTitle, onClose }: NotionExportModalProps) {
  const [parentId, setParentId] = useState<string>('');
  const [isPushing, setIsPushing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{
    pageId: string;
    url: string;
    title: string;
    message?: string;
  } | null>(null);

  const handlePushToNotion = async () => {
    try {
      setIsPushing(true);
      setError(null);
      setPushResult(null);

      const res = await fetch(`/api/briefs/${briefId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'notion',
          push: true,
          parentId: parentId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create Notion page');
      }

      setPushResult({
        pageId: data.pageId,
        url: data.url,
        title: data.title,
        message: data.message,
      });
    } catch (err: any) {
      setError(err.message || 'Error pushing brief to Notion');
    } finally {
      setIsPushing(false);
    }
  };

  const handleCopyBlocks = async () => {
    try {
      setIsCopying(true);
      setError(null);

      const res = await fetch(`/api/briefs/${briefId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'notion',
          push: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate Notion markdown');
      }

      if (data.markdown && typeof navigator !== 'undefined') {
        await navigator.clipboard.writeText(data.markdown);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err: any) {
      setError(err.message || 'Error exporting Notion blocks');
    } finally {
      setIsCopying(false);
    }
  };

  return (
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
          maxWidth: '560px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          gap: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Export & Push to Notion (E14)
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Create a live Notion page with formatted callouts, citations, and action checklists.
              </p>
            </div>
          </div>

          <button onClick={onClose} className="dash-icon-btn" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Brief Topic Snippet */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'var(--card-bg-subtle)',
            border: '1px solid var(--card-border)',
            fontSize: '0.82rem',
            color: 'var(--text)',
            fontWeight: 500,
            overflowWrap: 'break-word',
          }}
        >
          &ldquo;{briefTitle}&rdquo;
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#ef4444',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert with Link */}
        {pushResult && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>
                <Check size={16} />
                <span>Notion Page Created Successfully!</span>
              </div>
              <a
                href={pushResult.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <span>Open in Notion</span>
                <ExternalLink size={13} />
              </a>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
              Page ID: {pushResult.pageId}
            </div>
          </div>
        )}

        {/* Direct Push Section */}
        <div
          style={{
            padding: '16px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.05)',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="#818cf8" />
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>
                Option 1: Live Push to Notion (Direct API)
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', fontWeight: 600 }}>
              Feature E14
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Target Parent Page or Database ID (Optional — defaults to top-level Notion workspace search):
            </label>
            <input
              type="text"
              placeholder="e.g. 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--card-bg-subtle)',
                border: '1px solid var(--card-border)',
                color: 'var(--text)',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="button"
            onClick={handlePushToNotion}
            disabled={isPushing}
            className="dash-btn-primary"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              borderColor: '#3b82f6',
              padding: '9px 16px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isPushing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Writing blocks to Notion API...</span>
              </>
            ) : (
              <>
                <Layers size={15} />
                <span>Push as Live Notion Page</span>
              </>
            )}
          </button>
        </div>

        {/* Copy Blocks Fallback */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'var(--card-bg-subtle)',
            border: '1px solid var(--card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
              Option 2: Copy Notion-Formatted Blocks
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Copies rich Markdown with callouts, quotes, and checkboxes to your clipboard.
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyBlocks}
            disabled={isCopying}
            className="dash-btn-secondary"
            style={{
              fontSize: '0.78rem',
              padding: '7px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? (
              <>
                <Check size={14} color="#10b981" />
                <span style={{ color: '#10b981' }}>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy Blocks</span>
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button type="button" onClick={onClose} className="dash-btn-secondary" style={{ fontSize: '0.8rem', padding: '7px 18px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
