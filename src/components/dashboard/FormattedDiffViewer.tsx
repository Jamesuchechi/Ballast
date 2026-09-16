'use client';

import React, { useState } from 'react';
import {
  Eye,
  Code2,
  Plus,
  Minus,
  CheckCircle2,
  FileText,
  Clock,
  Tag,
  Shield,
  Layers,
} from 'lucide-react';

export interface DiffLine {
  type: 'add' | 'del' | 'same';
  text: string;
}

export interface FormattedDiffViewerProps {
  lines: DiffLine[];
  fromLabel?: string;
  toLabel?: string;
  defaultMode?: 'preview' | 'raw';
}

/**
 * Renders bold and inline code in a string without external markdown dependencies.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  // Simple regex to split by bold **text** or inline code `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key++} style={{ fontWeight: 600, color: 'var(--text)' }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key++}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85em',
            padding: '2px 5px',
            background: 'var(--card-bg-subtle)',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            color: '#10b981',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function FormattedDiffViewer({
  lines,
  fromLabel,
  toLabel,
  defaultMode = 'preview',
}: FormattedDiffViewerProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>(defaultMode);

  const additions = lines.filter((l) => l.type === 'add').length;
  const deletions = lines.filter((l) => l.type === 'del').length;

  // Format ISO timestamp strings into friendly dates if encountered
  const formatIfDate = (str: string) => {
    const isoMatch = str.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    if (isoMatch) {
      try {
        const d = new Date(isoMatch[0]);
        return str.replace(isoMatch[0], d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
      } catch {
        return str;
      }
    }
    return str;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* View Mode Bar & Quick Stats */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          background: 'var(--card-bg-subtle)',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid var(--card-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Revision Changes:
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <Plus size={12} />
            {additions} Added
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <Minus size={12} />
            {deletions} Removed
          </span>

          {(fromLabel || toLabel) && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
              {fromLabel && <span>Previous: <strong>{fromLabel}</strong></span>}
              {fromLabel && toLabel && <span> &rarr; </span>}
              {toLabel && <span>Current: <strong>{toLabel}</strong></span>}
            </span>
          )}
        </div>

        {/* View Toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--surface-hover)',
            borderRadius: '8px',
            padding: '3px',
            border: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={viewMode === 'preview' ? 'dash-btn-primary' : 'dash-btn-secondary'}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Eye size={13} />
            <span>Formatted Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={viewMode === 'raw' ? 'dash-btn-primary' : 'dash-btn-secondary'}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Code2 size={13} />
            <span>Raw Markdown Diff</span>
          </button>
        </div>
      </div>

      {/* Mode: Formatted Preview (Rich, human-readable document style) */}
      {viewMode === 'preview' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          {lines.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '24px 0' }}>
              No differences detected between these revisions.
            </p>
          ) : (
            lines.map((line, idx) => {
              const raw = line.text;
              const trimmed = raw.trim();

              if (!trimmed) {
                return <div key={idx} style={{ height: '8px' }} />;
              }

              // 1. Heading 1 (# Brief: ...)
              if (trimmed.startsWith('# ')) {
                const headingText = trimmed.replace(/^#\s*/, '');
                return (
                  <div
                    key={idx}
                    style={{
                      marginTop: idx > 0 ? '16px' : 0,
                      marginBottom: '8px',
                      paddingBottom: '8px',
                      borderBottom: '2px solid var(--card-border)',
                    }}
                  >
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                      {headingText}
                    </h2>
                  </div>
                );
              }

              // 2. Heading 2 (## Section Title)
              if (trimmed.startsWith('## ')) {
                const headingText = trimmed.replace(/^##\s*/, '');
                return (
                  <div
                    key={idx}
                    style={{
                      marginTop: '18px',
                      marginBottom: '8px',
                      paddingBottom: '6px',
                      borderBottom: '1px solid var(--card-border)',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: line.type === 'add' ? '#10b981' : line.type === 'del' ? '#ef4444' : 'var(--text)',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {line.type === 'add' && <Plus size={15} color="#10b981" />}
                      {line.type === 'del' && <Minus size={15} color="#ef4444" />}
                      <span>{headingText}</span>
                      {line.type === 'add' && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '1px 6px', borderRadius: '4px' }}>
                          New Section
                        </span>
                      )}
                      {line.type === 'del' && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: '4px' }}>
                          Removed Section
                        </span>
                      )}
                    </h3>
                  </div>
                );
              }

              // 3. Heading 3 (### Sub-section)
              if (trimmed.startsWith('### ')) {
                const subText = trimmed.replace(/^###\s*/, '');
                return (
                  <h4
                    key={idx}
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--text-muted)',
                      marginTop: '12px',
                      marginBottom: '4px',
                    }}
                  >
                    {subText}
                  </h4>
                );
              }

              // 4. Metadata rows (As of, Mode, Status)
              if (trimmed.startsWith('As of:') || trimmed.startsWith('Mode:') || trimmed.startsWith('Status:')) {
                const formatted = formatIfDate(trimmed);
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: line.type === 'add' ? 'rgba(16, 185, 129, 0.1)' : line.type === 'del' ? 'rgba(239, 68, 68, 0.1)' : 'var(--card-bg-subtle)',
                      border: line.type === 'add' ? '1px solid rgba(16, 185, 129, 0.3)' : line.type === 'del' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
                      fontSize: '0.78rem',
                      color: line.type === 'del' ? '#ef4444' : 'var(--text)',
                      textDecoration: line.type === 'del' ? 'line-through' : 'none',
                      marginRight: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <Clock size={12} color="var(--text-muted)" />
                    <span>{formatted}</span>
                    {line.type === 'add' && <span style={{ color: '#10b981', fontWeight: 600 }}>(Updated)</span>}
                    {line.type === 'del' && <span style={{ color: '#ef4444' }}>(Previous)</span>}
                  </div>
                );
              }

              // 5. UUIDs / Source chunk IDs (e.g. acfa293e-4988-4129-8322-0469c0ddded0)
              const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
              if (uuidMatch) {
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: line.type === 'add' ? 'rgba(16, 185, 129, 0.08)' : 'var(--card-bg-subtle)',
                      border: '1px solid var(--border)',
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)',
                      marginRight: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <FileText size={11} color="#10b981" />
                    <span>Source document: <code style={{ fontFamily: 'var(--font-mono)' }}>{uuidMatch[0].slice(0, 8)}...</code></span>
                    {line.type === 'add' && <span style={{ color: '#10b981' }}>+ new</span>}
                  </div>
                );
              }

              // 6. Claim items (- Claim: ...)
              if (trimmed.includes('Claim:')) {
                const claimClean = trimmed.replace(/^[-*+]\s*/, '').replace(/^Claim:\s*/, '');
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background:
                        line.type === 'add'
                          ? 'rgba(16, 185, 129, 0.1)'
                          : line.type === 'del'
                          ? 'rgba(239, 68, 68, 0.08)'
                          : 'var(--card-bg-subtle)',
                      borderLeft:
                        line.type === 'add'
                          ? '3px solid #10b981'
                          : line.type === 'del'
                          ? '3px solid #ef4444'
                          : '3px solid var(--card-border)',
                      borderTop: '1px solid var(--card-border)',
                      borderRight: '1px solid var(--card-border)',
                      borderBottom: '1px solid var(--card-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: line.type === 'add' ? '#10b981' : line.type === 'del' ? '#ef4444' : 'var(--text-muted)',
                        }}
                      >
                        {line.type === 'add' ? '✓ Added Verified Claim' : line.type === 'del' ? '✗ Superseded Claim' : 'Verified Claim'}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.86rem',
                        color: line.type === 'del' ? 'var(--text-muted)' : 'var(--text)',
                        textDecoration: line.type === 'del' ? 'line-through' : 'none',
                        lineHeight: '1.5',
                      }}
                    >
                      {renderInlineMarkdown(claimClean)}
                    </div>
                  </div>
                );
              }

              // 7. Bullet items (- or * or nested)
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ - ') || trimmed.startsWith('- - ')) {
                const cleanBullet = trimmed
                  .replace(/^[-*]\s*/, '')
                  .replace(/^\+\s*[-*]\s*/, '')
                  .replace(/^-\s*[-*]\s*/, '');

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background:
                        line.type === 'add'
                          ? 'rgba(16, 185, 129, 0.08)'
                          : line.type === 'del'
                          ? 'rgba(239, 68, 68, 0.06)'
                          : 'transparent',
                      borderLeft:
                        line.type === 'add'
                          ? '2px solid #10b981'
                          : line.type === 'del'
                          ? '2px solid #ef4444'
                          : '2px solid transparent',
                    }}
                  >
                    <div style={{ marginTop: '3px', flexShrink: 0 }}>
                      {line.type === 'add' ? (
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: '#10b981',
                            color: '#000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          +
                        </div>
                      ) : line.type === 'del' ? (
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: '#ef4444',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          -
                        </div>
                      ) : (
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--text-muted)',
                            margin: '6px',
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '0.86rem',
                        lineHeight: '1.6',
                        color: line.type === 'del' ? 'var(--text-muted)' : 'var(--text)',
                        textDecoration: line.type === 'del' ? 'line-through' : 'none',
                        flex: 1,
                      }}
                    >
                      {renderInlineMarkdown(cleanBullet)}
                    </div>
                  </div>
                );
              }

              // 8. Default: Regular paragraph text
              return (
                <div
                  key={idx}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background:
                      line.type === 'add'
                        ? 'rgba(16, 185, 129, 0.08)'
                        : line.type === 'del'
                        ? 'rgba(239, 68, 68, 0.06)'
                        : 'transparent',
                    color: line.type === 'del' ? 'var(--text-muted)' : 'var(--text)',
                    textDecoration: line.type === 'del' ? 'line-through' : 'none',
                    fontSize: '0.86rem',
                    lineHeight: '1.6',
                  }}
                >
                  {renderInlineMarkdown(raw)}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Mode: Raw Markdown Diff (Git terminal style) */
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            background: '#090d16',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            padding: '16px',
            lineHeight: '1.7',
            overflowX: 'auto',
            maxHeight: '520px',
            overflowY: 'auto',
          }}
        >
          {lines.map((line, idx) => {
            if (line.type === 'add') {
              return (
                <div
                  key={idx}
                  style={{
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.12)',
                    padding: '1px 6px',
                    borderRadius: '2px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  + {line.text}
                </div>
              );
            }
            if (line.type === 'del') {
              return (
                <div
                  key={idx}
                  style={{
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.12)',
                    padding: '1px 6px',
                    borderRadius: '2px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  - {line.text}
                </div>
              );
            }
            return (
              <div
                key={idx}
                style={{
                  color: '#cbd5e1',
                  padding: '1px 6px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                &nbsp; {line.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
