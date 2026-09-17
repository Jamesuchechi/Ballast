'use client';

import React, { useState, useEffect } from 'react';
import { Share2, X, Copy, Check, ExternalLink, ShieldCheck, Clock, AlertCircle } from 'lucide-react';

interface ShareBriefModalProps {
  briefId: string;
  briefQuestion: string;
  onClose: () => void;
}

export function ShareBriefModal({ briefId, briefQuestion, onClose }: ShareBriefModalProps) {
  const [expiresInHours, setExpiresInHours] = useState<number>(72);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateLink = async (hours = expiresInHours) => {
    try {
      setIsGenerating(true);
      setError(null);
      const res = await fetch(`/api/briefs/${briefId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInHours: hours }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate share link');
        return;
      }

      setShareUrl(data.shareUrl);
      setExpiresAt(data.expiresAt);
    } catch (err: any) {
      setError(err.message || 'Error creating share link');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (briefId) {
      handleGenerateLink(72);
    }
  }, [briefId]);

  const handleCopy = async () => {
    if (shareUrl && typeof navigator !== 'undefined') {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          maxWidth: '540px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Share2 size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Share Read-Only Brief
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Create an expiring signed link to share this brief publicly.
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
          &ldquo;{briefQuestion}&rdquo;
        </div>

        {/* Expiration Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Link Expiration Window
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: '24 Hours', hours: 24 },
              { label: '3 Days', hours: 72 },
              { label: '7 Days', hours: 168 },
              { label: '30 Days', hours: 720 },
            ].map((opt) => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => {
                  setExpiresInHours(opt.hours);
                  handleGenerateLink(opt.hours);
                }}
                disabled={isGenerating}
                style={{
                  padding: '8px 4px',
                  borderRadius: '6px',
                  border: expiresInHours === opt.hours ? '1px solid #6366f1' : '1px solid var(--card-border)',
                  background: expiresInHours === opt.hours ? 'rgba(99, 102, 241, 0.15)' : 'var(--card-bg-subtle)',
                  color: expiresInHours === opt.hours ? '#a5b4fc' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontWeight: expiresInHours === opt.hours ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
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

        {/* Share Link Row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Expiring Signed URL
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={isGenerating ? 'Generating secure signed link...' : shareUrl}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'var(--card-bg-subtle)',
                border: '1px solid var(--card-border)',
                color: 'var(--text)',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!shareUrl || isGenerating}
              className="dash-btn-primary"
              style={{
                background: copied ? '#10b981' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                borderColor: copied ? '#10b981' : '#6366f1',
                padding: '8px 16px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Security & Privacy Notice */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.06)',
            border: '1px solid rgba(99, 102, 241, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '0.75rem',
            color: '#a5b4fc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} color="#818cf8" />
            <strong style={{ color: '#ffffff' }}>Privacy & Grounding Guarantee</strong>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.45 }}>
            Recipients can read the full brief markdown and verification claims. Internal source connection tokens, workspace IDs, and raw document storage URIs are scrubbed.
          </p>
          {expiresAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', color: '#818cf8' }}>
              <Clock size={12} />
              <span>Valid until {new Date(expiresAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
          {shareUrl ? (
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.78rem',
                color: '#818cf8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'none',
              }}
            >
              <span>Preview Public View</span>
              <ExternalLink size={12} />
            </a>
          ) : <div />}

          <button type="button" onClick={onClose} className="dash-btn-secondary" style={{ fontSize: '0.8rem', padding: '7px 16px' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
