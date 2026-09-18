'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  X,
  Search,
  Users,
  Activity,
  Globe,
  Calendar,
  AlertTriangle,
  Briefcase,
  MessageSquare,
  UserCheck,
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  CalendarClock,
  Check,
} from 'lucide-react';
import { BRIEF_TEMPLATES, TEMPLATE_CATEGORIES, type BriefTemplate } from '@/lib/templates';
import { renderQuestionTemplate } from '@/lib/templateValidator';

interface BriefTemplatesModalProps {
  onClose: () => void;
  onSelectTemplate: (template: BriefTemplate, action: 'use_now' | 'schedule') => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  'Leadership & Status': Users,
  'Engineering & Product': Activity,
  'Market & Intelligence': Globe,
  'Meetings & 1-on-1': Calendar,
};

const TEMPLATE_ICONS: Record<string, any> = {
  Users,
  Activity,
  Globe,
  Calendar,
  AlertTriangle,
  Briefcase,
  MessageSquare,
  UserCheck,
};

export function BriefTemplatesModal({ onClose, onSelectTemplate }: BriefTemplatesModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTemplate, setActiveTemplate] = useState<BriefTemplate>(BRIEF_TEMPLATES[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    return BRIEF_TEMPLATES.filter((tpl) => {
      const matchesCategory =
        selectedCategory === 'All' || tpl.category.toLowerCase() === selectedCategory.toLowerCase();

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tpl.title.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.question.toLowerCase().includes(q) ||
        tpl.tags.some((tag) => tag.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const previewRenderedQuestion = useMemo(() => {
    return renderQuestionTemplate(activeTemplate.question, {
      date: new Date(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
  }, [activeTemplate]);

  const handleCopyQuestion = async (tpl: BriefTemplate) => {
    if (typeof navigator !== 'undefined') {
      await navigator.clipboard.writeText(tpl.question);
      setCopiedId(tpl.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
    >
      <div
        className="dash-card"
        style={{
          maxWidth: '960px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--card-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  Brief Templates Library
                </h3>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#a5b4fc',
                    fontWeight: 600,
                  }}
                >
                  Feature E15
                </span>
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Jumpstart high-signal intelligence briefs with battle-tested questions and schedule presets.
              </p>
            </div>
          </div>

          <button onClick={onClose} className="dash-icon-btn" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            background: 'var(--card-bg-subtle)',
            flexWrap: 'wrap',
          }}
        >
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['All', ...TEMPLATE_CATEGORIES].map((cat) => {
              const Icon = CATEGORY_ICONS[cat] || Layers;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: isSelected ? '1px solid #6366f1' : '1px solid var(--card-border)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                    color: isSelected ? '#a5b4fc' : 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={13} />
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '240px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px 6px 30px',
                borderRadius: '6px',
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                color: 'var(--text)',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Main Content Area (2-column layout) */}
        <div style={{ display: 'flex', flex: 1, minHeight: '440px', overflow: 'hidden' }}>
          {/* Left Column: Template Cards List */}
          <div
            style={{
              width: '45%',
              borderRight: '1px solid var(--card-border)',
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: 'var(--card-bg-subtle)',
            }}
          >
            {filteredTemplates.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                }}
              >
                No templates found matching &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              filteredTemplates.map((tpl) => {
                const Icon = TEMPLATE_ICONS[tpl.icon] || BookOpen;
                const isSelected = activeTemplate.id === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setActiveTemplate(tpl)}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #6366f1' : '1px solid var(--card-border)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--card-bg)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.1)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                            color: isSelected ? '#a5b4fc' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon size={15} />
                        </div>
                        <strong style={{ fontSize: '0.84rem', color: isSelected ? '#ffffff' : 'var(--text)' }}>
                          {tpl.title}
                        </strong>
                      </div>

                      <span
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            tpl.suggestedMode === 'world'
                              ? 'rgba(6, 182, 212, 0.15)'
                              : 'rgba(99, 102, 241, 0.15)',
                          color: tpl.suggestedMode === 'world' ? '#22d3ee' : '#a5b4fc',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {tpl.suggestedMode}
                      </span>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.74rem',
                        color: 'var(--text-muted)',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {tpl.description}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {tpl.connectors.map((c) => (
                        <span
                          key={c}
                          style={{
                            fontSize: '0.65rem',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--card-border)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Template Detail & Live Preview */}
          <div
            style={{
              width: '55%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              overflowY: 'auto',
              background: 'var(--card-bg)',
            }}
          >
            {/* Header info */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: '#818cf8',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {activeTemplate.category}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Mode: <strong style={{ color: 'var(--text)' }}>{activeTemplate.suggestedMode.toUpperCase()}</strong>
                </span>
              </div>

              <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 6px 0' }}>
                {activeTemplate.title}
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {activeTemplate.description}
              </p>
            </div>

            {/* Question Text Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Question Prompt Text
                </label>
                <button
                  type="button"
                  onClick={() => handleCopyQuestion(activeTemplate)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedId === activeTemplate.id ? '#10b981' : '#818cf8',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedId === activeTemplate.id ? <Check size={12} /> : null}
                  <span>{copiedId === activeTemplate.id ? 'Copied' : 'Copy Question'}</span>
                </button>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--card-bg-subtle)',
                  border: '1px solid var(--card-border)',
                  fontSize: '0.82rem',
                  color: 'var(--text)',
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {activeTemplate.question}
              </div>
            </div>

            {/* Live Rendered Preview (if dynamic tags exist) */}
            {activeTemplate.question.includes('{{') && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(99, 102, 241, 0.05)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc', fontSize: '0.74rem', fontWeight: 600 }}>
                  <Sparkles size={13} />
                  <span>Live Rendered Resolution Preview:</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                  &ldquo;{previewRenderedQuestion}&rdquo;
                </div>
              </div>
            )}

            {/* Suggested Cron Schedule */}
            {activeTemplate.suggestedCron && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="#10b981" />
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                      Suggested Recurring Schedule
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {activeTemplate.cronDescription} (<code style={{ fontFamily: 'var(--font-mono)' }}>{activeTemplate.suggestedCron}</code>)
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectTemplate(activeTemplate, 'schedule')}
                  className="dash-btn-secondary"
                  style={{ fontSize: '0.74rem', padding: '5px 10px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                >
                  <CalendarClock size={13} />
                  <span>Set Schedule</span>
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => onSelectTemplate(activeTemplate, 'use_now')}
                className="dash-btn-primary"
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                }}
              >
                <span>Use in New Brief</span>
                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                onClick={() => onSelectTemplate(activeTemplate, 'schedule')}
                className="dash-btn-secondary"
                style={{
                  padding: '10px 16px',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CalendarClock size={15} />
                <span>Schedule Recurring</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
