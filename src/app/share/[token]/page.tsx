'use client';

import React, { useEffect, useState, use } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  Share2, 
  Printer, 
  Copy, 
  Check, 
  AlertTriangle, 
  FileText, 
  Sparkles, 
  Globe, 
  ExternalLink 
} from 'lucide-react';

interface SharedBriefData {
  id: string;
  question: string;
  mode: 'home' | 'world';
  status: string;
  markdown: string;
  as_of: string;
  published_at: string;
}

export default function PublicSharedBriefPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<SharedBriefData | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadSharedBrief() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/share/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'This share link is invalid, malformed, or has expired.');
          setLoading(false);
          return;
        }

        setBrief(data.brief);
        setExpiresAt(data.expiresAt);
      } catch (err: any) {
        setError(err.message || 'Failed to load shared brief.');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadSharedBrief();
    }
  }, [token]);

  const handleCopyLink = async () => {
    if (typeof window !== 'undefined') {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090a0f',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid rgba(99, 102, 241, 0.2)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span style={{ fontSize: '0.95rem', color: '#94a3b8' }}>Loading shared brief...</span>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#090a0f',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px'
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px', color: '#f8fafc' }}>
            Link Expired or Invalid
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 24px' }}>
            {error || 'The requested brief share link is no longer accessible. Share links automatically expire to protect sensitive data.'}
          </p>
          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#6366f1',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            Go to Ballast Home
          </a>
        </div>
      </div>
    );
  }

  const tldrMatch = brief.markdown.match(/> \*\*TL;DR:\*\* (.*)/);
  const tldr = tldrMatch ? tldrMatch[1] : '';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#090a0f',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '32px 20px',
    }}>
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body { background: white !important; color: black !important; }
            .no-print { display: none !important; }
            .share-card { border: none !important; box-shadow: none !important; background: white !important; color: black !important; }
          }
        `
      }} />

      <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Top Navbar / Brand */}
        <div className="no-print" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem',
              color: '#ffffff'
            }}>
              B
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em', color: '#f8fafc' }}>BALLAST</span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '6px', padding: '2px 6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px' }}>
                Read-Only Shared Brief
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#818cf8',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Expiration & Security Banner */}
        {expiresAt && (
          <div className="no-print" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            fontSize: '0.78rem',
            color: '#a5b4fc',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={15} color="#818cf8" />
              <span>Grounded, citation-verified research brief. Internal tokens and private source details are scrubbed.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
              <Clock size={13} />
              <span>Link expires {new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}

        {/* Main Document Card */}
        <div className="share-card" style={{
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '36px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                background: brief.mode === 'world' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: brief.mode === 'world' ? '#06b6d4' : '#10b981',
                border: `1px solid ${brief.mode === 'world' ? 'rgba(6, 182, 212, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {brief.mode === 'world' ? <Globe size={12} /> : <FileText size={12} />}
                {brief.mode === 'world' ? 'World Mode (Private + Web)' : 'Home Mode (Private)'}
              </span>

              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Published {new Date(brief.published_at || brief.as_of).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              lineHeight: 1.3,
              margin: 0
            }}>
              {brief.question}
            </h1>
          </div>

          {/* TL;DR Callout */}
          {tldr && (
            <div style={{
              padding: '16px 20px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(6, 182, 212, 0.08))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="#818cf8" />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8' }}>
                  Executive Summary (TL;DR)
                </span>
              </div>
              <p style={{ fontSize: '0.94rem', lineHeight: 1.6, color: '#f1f5f9', margin: 0, fontWeight: 500 }}>
                {tldr}
              </p>
            </div>
          )}

          {/* Formatted Markdown Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: 1.65 }}>
            {brief.markdown.split('\n\n').map((block: string, idx: number) => {
              if (block.startsWith('# ')) return null;
              if (block.startsWith('> **TL;DR:**')) return null;

              if (block.startsWith('## ')) {
                const lines = block.split('\n');
                const heading = lines[0].replace('## ', '').trim();
                const rest = lines.slice(1);

                return (
                  <div key={idx} style={{ marginTop: '12px' }}>
                    <h2 style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: '#f8fafc',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      paddingBottom: '8px',
                      marginBottom: '12px',
                      letterSpacing: '-0.01em'
                    }}>
                      {heading}
                    </h2>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {rest.map((line, lIdx) => {
                        const trimmed = line.trim();
                        if (!trimmed) return null;

                        if (trimmed.startsWith('### ')) {
                          return (
                            <h3 key={lIdx} style={{
                              fontSize: '0.78rem',
                              fontFamily: 'monospace',
                              textTransform: 'uppercase',
                              color: '#94a3b8',
                              margin: '12px 0 4px',
                              letterSpacing: '0.05em'
                            }}>
                              {trimmed.replace('### ', '')}
                            </h3>
                          );
                        }

                        if (trimmed.startsWith('- Claim: ') || trimmed.includes('- Claim: ')) {
                          const claimText = trimmed.replace(/^.*?-\s*Claim:\s*/i, '');
                          return (
                            <div key={lIdx} style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              fontSize: '0.88rem',
                              color: '#f1f5f9'
                            }}>
                              <span style={{ color: '#10b981', fontWeight: 700, marginRight: '6px' }}>Claim:</span>
                              <span>{claimText}</span>
                            </div>
                          );
                        }

                        if (trimmed.startsWith('- Proposed Action: ') || trimmed.includes('- Proposed Action: ')) {
                          const actionText = trimmed.replace(/^.*?-\s*Proposed Action:\s*/i, '');
                          return (
                            <div key={lIdx} style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: 'rgba(99, 102, 241, 0.06)',
                              border: '1px solid rgba(99, 102, 241, 0.2)',
                              fontSize: '0.88rem',
                              color: '#e0e7ff'
                            }}>
                              <span style={{ color: '#818cf8', fontWeight: 700, marginRight: '6px' }}>Action:</span>
                              <span>{actionText}</span>
                            </div>
                          );
                        }

                        if (trimmed.startsWith('- Conflict: ') || trimmed.includes('- Conflict: ')) {
                          const conflictText = trimmed.replace(/^.*?-\s*Conflict:\s*/i, '');
                          return (
                            <div key={lIdx} style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: 'rgba(245, 158, 11, 0.08)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              fontSize: '0.88rem',
                              color: '#fef3c7'
                            }}>
                              <span style={{ color: '#f59e0b', fontWeight: 700, marginRight: '6px' }}>Conflict:</span>
                              <span>{conflictText}</span>
                            </div>
                          );
                        }

                        if (trimmed.startsWith('- ')) {
                          return (
                            <li key={lIdx} style={{ marginLeft: '16px', fontSize: '0.9rem', color: '#cbd5e1' }}>
                              {trimmed.slice(2)}
                            </li>
                          );
                        }

                        return (
                          <p key={lIdx} style={{ margin: '4px 0', fontSize: '0.9rem', color: '#cbd5e1' }}>
                            {trimmed}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <p key={idx} style={{ margin: 0, fontSize: '0.92rem', color: '#cbd5e1' }}>
                  {block}
                </p>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div className="no-print" style={{
          textAlign: 'center',
          padding: '24px 0',
          fontSize: '0.78rem',
          color: '#64748b'
        }}>
          <span>Generated by </span>
          <strong style={{ color: '#94a3b8' }}>Ballast Dual-Gate Grounding Engine</strong>
          <span> &bull; Read-only shared view</span>
        </div>

      </div>
    </div>
  );
}
