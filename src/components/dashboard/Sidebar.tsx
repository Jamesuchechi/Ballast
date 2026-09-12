'use client';

import React from 'react';
import Link from 'next/link';
import {
  Compass,
  FileText,
  UploadCloud,
  CheckSquare,
  Database,
  Clock,
  GitBranch,
  Activity,
  ShieldCheck,
  Flag,
  Settings,
  Lock,
  Plus,
  X,
  ChevronDown,
  LogOut,
  ShieldAlert,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';

export interface SidebarProps {
  user: any;
  workspace: any;
  activeSection: string;
  onSelectSection: (section: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  briefsCount?: number;
  pendingActionsCount?: number;
  sourcesCount?: number;
  schedulesCount?: number;
  accessLogsCount?: number;
  flagsCount?: number;
  telemetryAvgLatency?: number;
  onCreateBrief?: () => void;
  actionLoading?: boolean;
  onLogout?: () => void;
  isDemo?: boolean;
}

interface NavSection {
  title: string;
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
    count?: string | number;
    badgeColor?: string;
    badgeText?: string;
  }[];
}

export function Sidebar({
  user,
  workspace,
  activeSection,
  onSelectSection,
  isOpenMobile,
  onCloseMobile,
  briefsCount = 0,
  pendingActionsCount = 0,
  sourcesCount = 0,
  schedulesCount = 0,
  accessLogsCount = 0,
  flagsCount = 0,
  telemetryAvgLatency,
  onCreateBrief,
  actionLoading = false,
  onLogout,
  isDemo = false,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const navSections: NavSection[] = [
    {
      title: 'Workspace Core',
      items: [
        {
          id: 'briefs',
          label: 'Briefs Archive',
          icon: FileText,
          count: briefsCount,
        },
        {
          id: 'upload',
          label: 'Upload & Ingest',
          icon: UploadCloud,
          count: '20 MB',
          badgeColor: 'rgba(16, 185, 129, 0.12)',
          badgeText: '#34d399',
        },
        {
          id: 'actions',
          label: 'Action Drafts',
          icon: CheckSquare,
          count: pendingActionsCount,
          badgeColor: pendingActionsCount > 0 ? 'rgba(245, 158, 11, 0.18)' : undefined,
          badgeText: pendingActionsCount > 0 ? '#f59e0b' : undefined,
        },
      ],
    },
    {
      title: 'Knowledge & Automation',
      items: [
        {
          id: 'sources',
          label: 'Connected Sources',
          icon: Database,
          count: sourcesCount > 0 ? `${sourcesCount} live` : '0',
          badgeColor: sourcesCount > 0 ? 'rgba(16, 185, 129, 0.12)' : undefined,
          badgeText: sourcesCount > 0 ? '#10b981' : undefined,
        },
        {
          id: 'schedules',
          label: 'Schedules & Cron',
          icon: Clock,
          count: schedulesCount > 0 ? `${schedulesCount} active` : '0',
          badgeColor: schedulesCount > 0 ? 'rgba(59, 130, 246, 0.12)' : undefined,
          badgeText: schedulesCount > 0 ? '#60a5fa' : undefined,
        },
        {
          id: 'diff',
          label: 'Version Chains & Diff',
          icon: GitBranch,
        },
      ],
    },
    {
      title: 'Governance & Audit',
      items: [
        {
          id: 'audit',
          label: 'Runs & Telemetry',
          icon: Activity,
          count: telemetryAvgLatency !== undefined && telemetryAvgLatency > 0 ? `${telemetryAvgLatency}ms` : undefined,
          badgeColor: 'rgba(168, 85, 247, 0.12)',
          badgeText: '#c084fc',
        },
        {
          id: 'access-logs',
          label: 'Access & Audit Logs',
          icon: ShieldCheck,
          count: accessLogsCount > 0 ? accessLogsCount : '0',
        },
        {
          id: 'flags',
          label: 'Claim Flags & Eval',
          icon: Flag,
          count: flagsCount > 0 ? `${flagsCount} open` : '0',
          badgeColor: flagsCount > 0 ? 'rgba(239, 68, 68, 0.15)' : undefined,
          badgeText: flagsCount > 0 ? '#ef4444' : undefined,
        },
      ],
    },
    {
      title: 'System & Policy',
      items: [
        {
          id: 'settings',
          label: 'Workspace & Billing',
          icon: Settings,
        },
        {
          id: 'privacy',
          label: 'Security & Trust',
          icon: Lock,
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div onClick={onCloseMobile} className="dash-backdrop" />
      )}

      {/* Sidebar Container */}
      <aside className={`dash-sidebar ${isOpenMobile ? 'is-open' : ''}`}>
        {/* Workspace Brand Header */}
        <div className="dash-sidebar-header">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'var(--text)' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
              }}
            >
              <Compass size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, fontSize: '0.92rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Ballast
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  v1
                </span>
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Personal Briefing OS</span>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            onClick={onCloseMobile}
            className="dash-icon-btn mobile-only"
            aria-label="Close Sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Workspace Selector */}
        <div className="dash-sidebar-workspace">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Workspace</span>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>{workspace?.plan || 'Free'} Tier</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              fontSize: '0.82rem',
              fontWeight: 500,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workspace?.name || 'Personal Workspace'}
            </span>
            <ChevronDown size={14} color="var(--text-muted)" />
          </div>
        </div>

        {/* Primary Action Button: + New Brief */}
        <div style={{ padding: '12px 12px 0 12px' }}>
          <button
            onClick={() => {
              if (onCreateBrief) onCreateBrief();
              onCloseMobile();
            }}
            disabled={actionLoading}
            className="dash-sidebar-cta"
            title="Generate a new brief grounded strictly in private sources"
          >
            {actionLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} strokeWidth={2.5} />
            )}
            <span>New Brief</span>
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="dash-nav-list">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: '8px' }}>
              <div className="dash-sidebar-section-title">
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectSection(item.id);
                        onCloseMobile();
                      }}
                      className={`dash-nav-item ${isActive ? 'is-active' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={16} color={isActive ? '#10b981' : 'var(--text-muted)'} />
                        <span>{item.label}</span>
                      </div>
                      {item.count !== undefined && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '1px 6px',
                            borderRadius: '9999px',
                            background: item.badgeColor || 'var(--card-bg-subtle)',
                            color: item.badgeText || 'var(--text-muted)',
                            border: '1px solid var(--card-border)',
                            fontWeight: 600,
                          }}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Entitlements & Usage Meter */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--card-border)', background: 'var(--card-bg-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>Free Tier Briefs</span>
            <span>{briefsCount} / 10</span>
          </div>
          <div style={{ width: '100%', height: '5px', background: 'var(--card-border)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: '#10b981',
                borderRadius: '9999px',
                width: `${Math.min((briefsCount / 10) * 100, 100)}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          {isDemo && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                fontSize: '0.74rem',
                color: '#a5b4fc',
              }}
            >
              <div style={{ fontWeight: 600, color: '#c7d2fe', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={14} color="#818cf8" />
                Demo Workspace
              </div>
              Explore before signing up. Create account to connect Gmail/GitHub.
              <div style={{ marginTop: '8px' }}>
                <Link
                  href="/signup"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '5px 0',
                    textAlign: 'center',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    color: '#000000',
                    background: '#818cf8',
                    borderRadius: '6px',
                    textDecoration: 'none',
                  }}
                >
                  Sign Up Free
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--card-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text)',
                flexShrink: 0,
              }}
            >
              {user?.name?.[0] || user?.email?.[0] || 'G'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || user?.email || 'Guest Explorer'}
              </span>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {isDemo ? 'guest' : 'workspace owner'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={toggleTheme}
              className="dash-icon-btn"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} color="#facc15" /> : <Moon size={16} color="#6366f1" />}
            </button>

            {onLogout ? (
              <button
                onClick={onLogout}
                className="dash-icon-btn"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            ) : isDemo ? (
              <Link
                href="/login"
                style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: '#10b981', textDecoration: 'none', fontWeight: 600 }}
              >
                Log In
              </Link>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
