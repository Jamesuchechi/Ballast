'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Quote,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Mail,
  Calendar,
  HardDrive,
  GitBranch,
  MessageSquare,
  FileText,
  Globe,
  Flag,
  Sparkles,
  Info,
  Layers,
} from 'lucide-react';
import { cleanHtmlAndTracking, humanizeSourceLabel } from '@/lib/formatters';

export interface CitationItem {
  id?: string;
  brief_id?: string;
  source_id?: string;
  source_class: 'private' | 'web' | 'system';
  citation_type: 'support' | 'conflict' | 'missing' | 'unchecked';
  claim_span?: { start: number; end: number };
  quote: string;
  url?: string;
  connector?: string;
  uri?: string;
  trust_boundary?: 'verified' | 'untrusted_content';
  resolution_status?: string;
}

export interface CitationHoverPreviewProps {
  citation: CitationItem;
  claimText?: string;
  children?: React.ReactNode;
  badgeLabel?: string;
  showInlineBadge?: boolean;
  onFlag?: (quote: string, citationId?: string) => void;
  onInspect?: (sourceId?: string) => void;
}

export function CitationHoverPreview({
  citation,
  claimText,
  children,
  badgeLabel,
  showInlineBadge = true,
  onFlag,
  onInspect,
}: CitationHoverPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const cleanQuote = cleanHtmlAndTracking(citation.quote || '');
  const sourceLabel = humanizeSourceLabel(citation.url || citation.uri || citation.source_id, citation.source_class);
  const connector = citation.connector?.toLowerCase() || (citation.source_class === 'web' ? 'web' : 'source');
  const isVerifiedTrust = citation.trust_boundary === 'verified';
  const isConflict = citation.citation_type === 'conflict';
  const isConfirmedConflict = isConflict && citation.resolution_status === 'confirmed_accurate';

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      // Check viewport position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.top < 260) {
          setPosition('bottom');
        } else {
          setPosition('top');
        }
      }
      setIsOpen(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  const handleCopyQuote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(cleanQuote);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy quote:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Connector Icon Helper
  const renderConnectorIcon = () => {
    switch (connector) {
      case 'gmail':
        return <Mail size={12} color="#ef4444" />;
      case 'calendar':
        return <Calendar size={12} color="#3b82f6" />;
      case 'drive':
        return <HardDrive size={12} color="#10b981" />;
      case 'github':
        return <GitBranch size={12} color="#8b5cf6" />;
      case 'slack':
        return <MessageSquare size={12} color="#10b981" />;
      case 'notion':
        return <FileText size={12} color="#f43f5e" />;
      case 'web':
        return <Globe size={12} color="#06b6d4" />;
      default:
        return citation.source_class === 'web' ? <Globe size={12} color="#06b6d4" /> : <FileText size={12} color="#10b981" />;
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
      }}
    >
      {/* Children or Default Citation Trigger */}
      {children ? (
        <span
          style={{
            cursor: 'pointer',
            borderBottom: '1px dashed rgba(16, 185, 129, 0.5)',
            transition: 'all 0.15s ease',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
        >
          {children}
        </span>
      ) : null}

      {showInlineBadge && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          title="Hover or click to preview source quote and verification details"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono)',
            padding: '2px 6px',
            marginLeft: children ? '6px' : '0',
            borderRadius: '4px',
            border: isConflict
              ? '1px solid rgba(245, 158, 11, 0.4)'
              : isVerifiedTrust
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : '1px solid var(--card-border)',
            background: isConflict
              ? 'rgba(245, 158, 11, 0.12)'
              : isVerifiedTrust
              ? 'rgba(16, 185, 129, 0.12)'
              : 'var(--card-bg-subtle)',
            color: isConflict ? '#f59e0b' : isVerifiedTrust ? '#10b981' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Quote size={10} />
          <span>{badgeLabel || (isVerifiedTrust ? '🛡️ Verified Quote' : 'Quote Preview')}</span>
        </button>
      )}

      {/* Popover Floating Card */}
      {isOpen && (
        <div
          ref={popoverRef}
          role="tooltip"
          style={{
            position: 'absolute',
            [position === 'top' ? 'bottom' : 'top']: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '360px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--card-bg)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            padding: '14px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            animation: 'fadeIn 0.15s ease-out',
            textAlign: 'left',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              {/* Connector Badge */}
              <span
                className="dash-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.66rem',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'capitalize',
                  background: 'var(--card-bg-subtle)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--text)',
                }}
              >
                {renderConnectorIcon()}
                {connector}
              </span>

              {/* Trust Boundary Pill (Feature E12 integration) */}
              <span
                className="dash-badge"
                style={{
                  fontSize: '0.64rem',
                  fontFamily: 'var(--font-mono)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: isVerifiedTrust ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                  color: isVerifiedTrust ? '#34d399' : '#f59e0b',
                  border: isVerifiedTrust ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                {isVerifiedTrust ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
                {isVerifiedTrust ? 'Verified Internal' : 'Untrusted Source'}
              </span>

              {/* Conflict indicator if applicable */}
              {isConflict && (
                <span
                  className="dash-badge"
                  style={{
                    fontSize: '0.64rem',
                    background: isConfirmedConflict ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: isConfirmedConflict ? '#34d399' : '#f59e0b',
                    border: isConfirmedConflict ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                >
                  {isConfirmedConflict ? '✓ Confirmed' : '⚠ Conflict'}
                </span>
              )}
            </div>

            {/* Character Offset Span */}
            {citation.claim_span && (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
                title="Claim offset span in published brief markdown"
              >
                Span: {citation.claim_span.start}..{citation.claim_span.end}
              </span>
            )}
          </div>

          {/* Original Quote Body */}
          <blockquote
            style={{
              fontSize: '0.84rem',
              fontStyle: 'italic',
              lineHeight: '1.55',
              color: 'var(--text)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderLeft: `3px solid ${
                isConfirmedConflict
                  ? '#10b981'
                  : isConflict
                  ? '#f59e0b'
                  : citation.source_class === 'web'
                  ? '#06b6d4'
                  : '#10b981'
              }`,
              padding: '8px 12px',
              borderRadius: '0 6px 6px 0',
              margin: 0,
              maxHeight: '180px',
              overflowY: 'auto',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            &ldquo;{cleanQuote}&rdquo;
          </blockquote>

          {/* Claim Context if provided */}
          {claimText && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
              <strong style={{ color: '#10b981', flexShrink: 0 }}>Claim:</strong>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                {cleanHtmlAndTracking(claimText)}
              </span>
            </div>
          )}

          {/* Source Link & Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px solid var(--card-border)',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sourceLabel}
              </span>
              {(citation.url || citation.uri) && (
                <a
                  href={citation.url || citation.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                  title="Open original document link"
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleCopyQuote}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '0.68rem',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  background: 'var(--card-bg-subtle)',
                  border: '1px solid var(--card-border)',
                  color: isCopied ? '#10b981' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title="Copy original quote to clipboard"
              >
                {isCopied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>

              {onFlag && (
                <button
                  type="button"
                  onClick={() => onFlag(cleanQuote, citation.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.68rem',
                    padding: '3px 7px',
                    borderRadius: '4px',
                    background: 'transparent',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                  title="Flag this citation or claim"
                >
                  <Flag size={10} />
                  <span>Flag</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
