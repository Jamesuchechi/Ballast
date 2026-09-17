'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
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
  Bell,
  BarChart3,
  User as UserIcon,
  Check,
  Building,
} from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { BallastLogo } from '@/components/brand/BallastLogo';

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
  storageCount?: string | number;
  notificationsCount?: number;
  unreadNotificationsCount?: number;
  onCreateBrief?: () => void;
  actionLoading?: boolean;
  onLogout?: () => void;
  isDemo?: boolean;
  onWorkspaceSwitched?: () => void;
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
  storageCount,
  notificationsCount,
  unreadNotificationsCount = 0,
  onCreateBrief,
  actionLoading = false,
  onLogout,
  isDemo = false,
  onWorkspaceSwitched,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  // Multi-Workspace state
  const [isWsDropdownOpen, setIsWsDropdownOpen] = useState(false);
  const [workspacesList, setWorkspacesList] = useState<any[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isSwitchingWs, setIsSwitchingWs] = useState(false);
  const [isCreatingWs, setIsCreatingWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  const loadWorkspaces = async () => {
    try {
      setIsLoadingWorkspaces(true);
      const res = await fetch('/api/workspaces');
      if (res.ok) {
        const data = await res.json();
        setWorkspacesList(data.workspaces || []);
      }
    } catch (e) {
      console.warn('Failed to fetch workspaces:', e);
    } finally {
      setIsLoadingWorkspaces(false);
    }
  };

  const toggleWsDropdown = () => {
    const next = !isWsDropdownOpen;
    setIsWsDropdownOpen(next);
    if (next) {
      loadWorkspaces();
    }
  };

  const handleSwitchWorkspace = async (wsId: string) => {
    if (wsId === workspace?.id || isSwitchingWs) return;
    try {
      setIsSwitchingWs(true);
      const res = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wsId }),
      });
      if (res.ok) {
        setIsWsDropdownOpen(false);
        if (onWorkspaceSwitched) {
          onWorkspaceSwitched();
        } else {
          window.location.reload();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to switch workspace');
      }
    } catch (e: any) {
      alert('Failed to switch workspace: ' + e.message);
    } finally {
      setIsSwitchingWs(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || isCreatingWs) return;
    try {
      setIsCreatingWs(true);
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWsName.trim() }),
      });
      if (res.ok) {
        setShowCreateInput(false);
        setNewWsName('');
        setIsWsDropdownOpen(false);
        if (onWorkspaceSwitched) {
          onWorkspaceSwitched();
        } else {
          window.location.reload();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to create workspace');
      }
    } catch (e: any) {
      alert('Failed to create workspace: ' + e.message);
    } finally {
      setIsCreatingWs(false);
    }
  };

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
          count: storageCount,
          badgeColor: storageCount ? 'rgba(16, 185, 129, 0.12)' : undefined,
          badgeText: storageCount ? '#34d399' : undefined,
        },
        {
          id: 'actions',
          label: 'Action Drafts',
          icon: CheckSquare,
          count: pendingActionsCount,
          badgeColor: pendingActionsCount > 0 ? 'rgba(245, 158, 11, 0.18)' : undefined,
          badgeText: pendingActionsCount > 0 ? '#f59e0b' : undefined,
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: Bell,
          count: unreadNotificationsCount > 0 ? `${unreadNotificationsCount} new` : (notificationsCount && notificationsCount > 0 ? notificationsCount : undefined),
          badgeColor: unreadNotificationsCount > 0 ? 'rgba(239, 68, 68, 0.18)' : undefined,
          badgeText: unreadNotificationsCount > 0 ? '#ef4444' : undefined,
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
          id: 'analytics',
          label: 'Product Analytics',
          icon: BarChart3,
          count: 'Live',
          badgeColor: 'rgba(59, 130, 246, 0.12)',
          badgeText: '#3b82f6',
        },
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
          id: 'profile',
          label: 'Profile & Account',
          icon: UserIcon,
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
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <BallastLogo size={28} showBadge badgeText="v1" showSubtitle subtitleText="Personal Briefing OS" />
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

        {/* Workspace Selector & Dropdown */}
        <div className="dash-sidebar-workspace" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Workspace</span>
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>{workspace?.plan || 'Free'} Tier</span>
          </div>
          <button
            type="button"
            onClick={toggleWsDropdown}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              fontSize: '0.82rem',
              fontWeight: 500,
              color: 'var(--text)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <Building size={14} color="#10b981" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {workspace?.name || 'Personal Workspace'}
              </span>
            </div>
            <ChevronDown
              size={14}
              color="var(--text-muted)"
              style={{
                transform: isWsDropdownOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
                flexShrink: 0,
              }}
            />
          </button>

          {/* Dropdown Menu */}
          {isWsDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: '12px',
                right: '12px',
                zIndex: 100,
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: '10px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
                padding: '8px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-subtle)', padding: '4px 6px', marginBottom: '4px' }}>
                Switch Workspace
              </div>

              {isLoadingWorkspaces ? (
                <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px', fontSize: '0.8rem' }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Loading workspaces...</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {workspacesList.map((ws) => {
                    const isCurrent = ws.id === workspace?.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => handleSwitchWorkspace(ws.id)}
                        disabled={isSwitchingWs}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isCurrent ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                          border: isCurrent ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
                          cursor: isSwitchingWs ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          color: 'var(--text)',
                          fontSize: '0.8rem',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <span style={{ fontWeight: isCurrent ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ws.name}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {ws.plan || 'Free'} • {ws.role || 'member'}
                          </span>
                        </div>
                        {isCurrent && <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Create Workspace Inline */}
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--card-border)' }}>
                {showCreateInput ? (
                  <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Workspace name..."
                      value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                      disabled={isCreatingWs}
                      autoFocus
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.78rem',
                        borderRadius: '6px',
                        background: 'var(--bg)',
                        border: '1px solid var(--card-border)',
                        color: 'var(--text)',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateInput(false);
                          setNewWsName('');
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.72rem',
                          borderRadius: '4px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingWs || !newWsName.trim()}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          borderRadius: '4px',
                          background: '#10b981',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: isCreatingWs || !newWsName.trim() ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {isCreatingWs ? <Loader2 size={12} className="animate-spin" /> : 'Create'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreateInput(true)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Plus size={14} />
                    <span>Create new workspace</span>
                  </button>
                )}
              </div>
            </div>
          )}
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

        {/* Entitlements & Usage Meter (FR8.1, FR8.2) */}
        {(() => {
          const plan = workspace?.plan || 'free';
          const limit = plan === 'operator' ? 500 : plan === 'pro' ? 80 : 10;
          const meterLabel = plan === 'operator' ? 'Operator Brief Meter' : plan === 'pro' ? 'Pro Tier Briefs' : 'Free Tier Briefs';
          return (
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--card-border)', background: 'var(--card-bg-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span>{meterLabel}</span>
                <span>{briefsCount} / {limit}</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'var(--card-border)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: briefsCount >= limit ? '#ef4444' : '#10b981',
                    borderRadius: '9999px',
                    width: `${Math.min((briefsCount / limit) * 100, 100)}%`,
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
          );
        })()}

        {/* User Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            onClick={() => onSelectSection('profile')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', cursor: 'pointer', flex: 1, minWidth: 0 }}
            title="View User Profile & Account Settings"
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                {user?.name || user?.email?.split('@')[0] || 'My Profile'}
              </span>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {workspace?.role === 'owner' ? 'workspace owner' : 'member'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={toggleTheme}
              className="dash-icon-btn"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} color="#facc15" /> : <Moon size={16} color="#6366f1" />}
            </button>

            <button
              onClick={async () => {
                if (onLogout) {
                  onLogout();
                } else {
                  try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                  } catch {}
                  window.location.href = '/login';
                }
              }}
              className="dash-icon-btn"
              title="Log out of Ballast"
              style={{ color: '#ef4444' }}
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
