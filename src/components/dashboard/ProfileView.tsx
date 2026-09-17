'use client';

import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Shield,
  Key,
  Building,
  Calendar,
  CheckCircle2,
  Edit3,
  Lock,
  ArrowLeft,
  FileText,
  Database,
  Clock,
  LogOut,
  Plus,
  Check,
  Loader2,
  Mail,
  Send,
  Eye,
  Sparkles,
  X,
  Bell,
  CalendarDays,
} from 'lucide-react';

interface ProfileViewProps {
  initialUser?: any;
  initialWorkspace?: any;
  onLogout?: () => void;
  onProfileUpdated?: (user: any, workspace: any) => void;
  onWorkspaceSwitched?: () => void;
}

export function ProfileView({
  initialUser,
  initialWorkspace,
  onLogout,
  onProfileUpdated,
  onWorkspaceSwitched,
}: ProfileViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState<any>(initialUser || null);
  const [workspace, setWorkspace] = useState<any>(initialWorkspace || null);
  const [stats, setStats] = useState<{ briefsCount: number; sourcesCount: number; schedulesCount: number }>({
    briefsCount: 0,
    sourcesCount: 0,
    schedulesCount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro' | 'operator'>('operator');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Multi-Workspace Management State
  const [workspacesList, setWorkspacesList] = useState<any[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isSwitchingWs, setIsSwitchingWs] = useState(false);
  const [isCreatingWs, setIsCreatingWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  // Notification & Digest Preferences State
  const [prefs, setPrefs] = useState<{
    email_enabled: boolean;
    notify_on_publish: boolean;
    notify_on_fail: boolean;
    digest_enabled: boolean;
    digest_frequency: string;
    digest_day: string;
  }>({
    email_enabled: true,
    notify_on_publish: true,
    notify_on_fail: true,
    digest_enabled: true,
    digest_frequency: 'weekly',
    digest_day: 'monday',
  });
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);
  const [isUpdatingPref, setIsUpdatingPref] = useState(false);

  // Digest Preview & Test State
  const [showDigestModal, setShowDigestModal] = useState(false);
  const [digestPreviewHtml, setDigestPreviewHtml] = useState<string | null>(null);
  const [digestData, setDigestData] = useState<any | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const loadPreferences = async () => {
    try {
      setIsLoadingPrefs(true);
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setPrefs({
            email_enabled: data.preferences.email_enabled ?? true,
            notify_on_publish: data.preferences.notify_on_publish ?? true,
            notify_on_fail: data.preferences.notify_on_fail ?? true,
            digest_enabled: data.preferences.digest_enabled ?? true,
            digest_frequency: data.preferences.digest_frequency || 'weekly',
            digest_day: data.preferences.digest_day || 'monday',
          });
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    } finally {
      setIsLoadingPrefs(false);
    }
  };

  const handleUpdatePref = async (newPrefs: Partial<typeof prefs>) => {
    const updated = { ...prefs, ...newPrefs };
    setPrefs(updated);
    try {
      setIsUpdatingPref(true);
      setErrorMsg(null);
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: newPrefs }),
      });
      if (res.ok) {
        setSuccessMsg('Notification preferences updated');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || 'Failed to update preferences');
      }
    } catch (err: any) {
      setErrorMsg('Failed to update preference: ' + err.message);
    } finally {
      setIsUpdatingPref(false);
    }
  };

  const handleOpenDigestPreview = async () => {
    setShowDigestModal(true);
    try {
      setIsLoadingPreview(true);
      const res = await fetch('/api/digest');
      if (res.ok) {
        const data = await res.json();
        setDigestData(data.digest);
        setDigestPreviewHtml(data.html);
      }
    } catch (err) {
      console.error('Failed to load digest preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSendTestDigest = async () => {
    try {
      setIsSendingTest(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendToSelf: true, force: true }),
      });
      const data = await res.json();
      if (res.ok && data.result?.sent) {
        setSuccessMsg(`Test digest dispatched to ${data.result.recipients.join(', ')} (${data.result.briefCount} briefs included)`);
      } else {
        setErrorMsg(data.error || data.result?.reason || 'Failed to dispatch test digest');
      }
    } catch (err: any) {
      setErrorMsg('Error sending test digest: ' + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const loadWorkspaces = async () => {
    try {
      setIsLoadingWorkspaces(true);
      const res = await fetch('/api/workspaces');
      if (res.ok) {
        const data = await res.json();
        setWorkspacesList(data.workspaces || []);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setIsLoadingWorkspaces(false);
    }
  };

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setWorkspace(data.workspace);
        if (data.stats) setStats(data.stats);
        setName(data.user?.name || '');
        setWorkspaceName(data.workspace?.name || '');
        setPlan(data.workspace?.plan || 'operator');
      }
      await loadWorkspaces();
      await loadPreferences();
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSwitchWorkspace = async (wsId: string) => {
    if (wsId === workspace?.id || isSwitchingWs) return;
    try {
      setIsSwitchingWs(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: wsId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(`Switched to workspace: ${data.workspace?.name || 'Workspace'}`);
        await loadProfile();
        if (onWorkspaceSwitched) {
          onWorkspaceSwitched();
        } else if (onProfileUpdated) {
          onProfileUpdated(user, data.workspace);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || 'Failed to switch workspace');
      }
    } catch (err: any) {
      setErrorMsg('Failed to switch workspace: ' + err.message);
    } finally {
      setIsSwitchingWs(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || isCreatingWs) return;
    try {
      setIsCreatingWs(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWsName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(`Created and switched to workspace: ${data.workspace?.name || newWsName}`);
        setNewWsName('');
        setShowCreateInput(false);
        await loadProfile();
        if (onWorkspaceSwitched) {
          onWorkspaceSwitched();
        } else if (onProfileUpdated) {
          onProfileUpdated(user, data.workspace);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || 'Failed to create workspace');
      }
    } catch (err: any) {
      setErrorMsg('Failed to create workspace: ' + err.message);
    } finally {
      setIsCreatingWs(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword && newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match');
      return;
    }

    if (newPassword && !currentPassword) {
      setErrorMsg('Current password is required to change password');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          workspaceName: workspaceName.trim(),
          plan: workspace?.role === 'owner' ? plan : undefined,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setSuccessMsg('Profile updated successfully');
      setUser(data.user);
      if (data.workspace) setWorkspace((prev: any) => ({ ...prev, ...data.workspace }));
      if (onProfileUpdated) onProfileUpdated(data.user, data.workspace);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsEditing(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="dash-badge dash-badge-mode">Account Settings</span>
            <span className="dash-badge dash-badge-published">
              {workspace?.role === 'owner' ? 'Workspace Owner' : 'Team Member'}
            </span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
            {isEditing ? 'Edit Profile' : 'User Profile'}
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Manage your personal identity, credentials, and workspace settings.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {!isEditing ? (
            <>
              <button
                onClick={() => {
                  setIsEditing(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setName(user?.name || '');
                  setWorkspaceName(workspace?.name || '');
                  setPlan(workspace?.plan || 'operator');
                }}
                className="dash-btn-primary"
                style={{ fontSize: '0.8rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Edit3 size={14} />
                Edit Profile
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="dash-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}
                >
                  <LogOut size={14} />
                  Log Out
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => {
                setIsEditing(false);
                setErrorMsg(null);
              }}
              className="dash-btn-secondary"
              style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={14} />
              Back to Profile
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div
          style={{
            fontSize: '0.8rem',
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '10px 14px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}
        >
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            fontSize: '0.8rem',
            color: '#ef4444',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          {errorMsg}
        </div>
      )}

      {!isEditing ? (
        /* ========================================================================= */
        /* READONLY VIEW                                                             */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Main User Card */}
          <div className="dash-card" style={{ padding: '24px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                color: '#fff',
                fontSize: '1.6rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
              }}
            >
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  {user?.name || 'Unnamed User'}
                </h2>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {workspace?.plan || 'Free'} Plan
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {user?.email}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  <Calendar size={14} />
                  Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Recently'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  <Building size={14} />
                  Workspace: <strong>{workspace?.name || 'My Workspace'}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="dash-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                <FileText size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
                  {stats.briefsCount}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Total Briefs Generated
                </div>
              </div>
            </div>

            <div className="dash-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <Database size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
                  {stats.sourcesCount}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Connected Sources
                </div>
              </div>
            </div>

            <div className="dash-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
                  {stats.schedulesCount}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Active Schedules
                </div>
              </div>
            </div>
          </div>

          {/* Workspaces & Organizations Section */}
          <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building size={18} color="#10b981" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  Workspaces &amp; Organizations
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInput((prev) => !prev)}
                className="dash-btn-secondary"
                style={{ fontSize: '0.74rem', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} />
                <span>New Workspace</span>
              </button>
            </div>

            {/* Create Workspace Inline Form */}
            {showCreateInput && (
              <form
                onSubmit={handleCreateWorkspace}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  background: 'var(--card-bg-subtle)',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                }}
              >
                <input
                  type="text"
                  placeholder="Enter workspace name (e.g. Engineering, Research Team)..."
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  disabled={isCreatingWs}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateInput(false);
                    setNewWsName('');
                  }}
                  className="dash-btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '7px 12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingWs || !newWsName.trim()}
                  className="dash-btn-primary"
                  style={{ fontSize: '0.76rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {isCreatingWs ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
                </button>
              </form>
            )}

            {/* Workspaces List */}
            {isLoadingWorkspaces ? (
              <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px', fontSize: '0.8rem' }}>
                <Loader2 size={15} className="animate-spin" />
                <span>Loading available workspaces...</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {workspacesList.map((ws) => {
                  const isCurrent = ws.id === workspace?.id;
                  return (
                    <div
                      key={ws.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: isCurrent ? 'rgba(16, 185, 129, 0.08)' : 'var(--card-bg)',
                        border: isCurrent ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--card-border)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            background: isCurrent ? '#10b981' : 'var(--card-bg-subtle)',
                            color: isCurrent ? '#fff' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                          }}
                        >
                          {ws.name?.[0]?.toUpperCase() || 'W'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text)' }}>
                              {ws.name}
                            </span>
                            {isCurrent && (
                              <span
                                style={{
                                  fontSize: '0.66rem',
                                  padding: '1px 6px',
                                  borderRadius: '9999px',
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#10b981',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                Active
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {ws.plan?.toUpperCase() || 'FREE'} Tier • Role: {ws.role || 'member'} • {ws.memberCount || 1} member(s)
                          </span>
                        </div>
                      </div>

                      <div>
                        {isCurrent ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '0.76rem', fontWeight: 600 }}>
                            <Check size={16} />
                            <span>Current</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSwitchWorkspace(ws.id)}
                            disabled={isSwitchingWs}
                            className="dash-btn-secondary"
                            style={{ fontSize: '0.74rem', padding: '6px 12px' }}
                          >
                            {isSwitchingWs ? <Loader2 size={13} className="animate-spin" /> : 'Switch'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Email & Weekly Digest Notifications Section */}
          <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} color="#38bdf8" />
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    Email &amp; Weekly Digest Notifications
                  </h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Configure transactional notifications, instant brief alerts, and weekly briefing rollups.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleOpenDigestPreview}
                  className="dash-btn-secondary"
                  style={{ fontSize: '0.74rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Eye size={13} />
                  <span>Preview Digest</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendTestDigest}
                  disabled={isSendingTest}
                  className="dash-btn-secondary"
                  style={{ fontSize: '0.74rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8' }}
                >
                  {isSendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  <span>Send Test Digest</span>
                </button>
              </div>
            </div>

            {isLoadingPrefs ? (
              <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px', fontSize: '0.8rem' }}>
                <Loader2 size={15} className="animate-spin" />
                <span>Loading preferences...</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Master Email Switch */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--card-bg-subtle)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>
                      Global Email Notifications
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Enable or disable all outbound emails from Ballast for this account.
                    </div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '22px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={prefs.email_enabled}
                      onChange={(e) => handleUpdatePref({ email_enabled: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: prefs.email_enabled ? '#10b981' : 'var(--card-border)',
                        borderRadius: '22px',
                        transition: '0.2s',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          height: '16px',
                          width: '16px',
                          left: prefs.email_enabled ? '22px' : '3px',
                          bottom: '3px',
                          backgroundColor: '#ffffff',
                          borderRadius: '50%',
                          transition: '0.2s',
                        }}
                      />
                    </span>
                  </label>
                </div>

                {/* Sub-Preferences Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', opacity: prefs.email_enabled ? 1 : 0.5, pointerEvents: prefs.email_enabled ? 'auto' : 'none' }}>
                  {/* Weekly Digest Card */}
                  <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={15} color="#818cf8" />
                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>
                          Weekly Intelligence Digest
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={prefs.digest_enabled}
                        onChange={(e) => handleUpdatePref({ digest_enabled: e.target.checked })}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                      Aggregates all briefs published in the last 7 days with executive TL;DRs and claim statistics into one rollup.
                    </p>

                    {prefs.digest_enabled && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <select
                          value={prefs.digest_frequency}
                          onChange={(e) => handleUpdatePref({ digest_frequency: e.target.value as 'weekly' | 'daily' })}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.74rem',
                            borderRadius: '6px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--card-border)',
                            color: 'var(--text)',
                            outline: 'none',
                          }}
                        >
                          <option value="weekly">Weekly Rollup</option>
                          <option value="daily">Daily Summary</option>
                        </select>
                        <select
                          value={prefs.digest_day}
                          onChange={(e) => handleUpdatePref({ digest_day: e.target.value })}
                          disabled={prefs.digest_frequency === 'daily'}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.74rem',
                            borderRadius: '6px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--card-border)',
                            color: 'var(--text)',
                            outline: 'none',
                            opacity: prefs.digest_frequency === 'daily' ? 0.5 : 1,
                          }}
                        >
                          <option value="monday">Monday morning</option>
                          <option value="friday">Friday afternoon</option>
                          <option value="sunday">Sunday evening</option>
                          <option value="tuesday">Tuesday</option>
                          <option value="wednesday">Wednesday</option>
                          <option value="thursday">Thursday</option>
                          <option value="saturday">Saturday</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Instant Per-Brief Alerts */}
                  <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Bell size={15} color="#10b981" />
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>
                        Instant Per-Brief Alerts
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={prefs.notify_on_publish}
                          onChange={(e) => handleUpdatePref({ notify_on_publish: e.target.checked })}
                        />
                        <span>Send email immediately when a brief is published &amp; verified</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={prefs.notify_on_fail}
                          onChange={(e) => handleUpdatePref({ notify_on_fail: e.target.checked })}
                        />
                        <span>Send email immediately if a scheduled pipeline run fails</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Security & System Info */}
          <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#10b981" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Security &amp; Data Hardening (Phase 8 Standard)
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '6px' }}>
                <span>Encryption at Rest</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>AES-256-GCM Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '6px' }}>
                <span>OAuth Secrets Manager</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Encrypted Envelope</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '6px' }}>
                <span>Prompt Injection Critic</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Active (NFR1.5)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Public Share Links</span>
                <span style={{ color: 'var(--text-subtle)', fontStyle: 'italic' }}>Disabled (Not in v1)</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* EDIT PROFILE VIEW                                                         */
        /* ========================================================================= */
        <form onSubmit={handleSave} className="dash-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0' }}>
              Identity &amp; Workspace Information
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>
              Update your display name and primary workspace name.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>
                Full Name / Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Elena Rostova"
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--text)',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>
                Workspace Name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="My Organization"
                disabled={workspace?.role !== 'owner'}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: workspace?.role === 'owner' ? 'var(--input-bg)' : 'var(--card-border)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--text)',
                  fontSize: '0.84rem',
                  outline: 'none',
                  cursor: workspace?.role === 'owner' ? 'text' : 'not-allowed',
                }}
              />
              {workspace?.role !== 'owner' && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Only workspace owners can rename the workspace.
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>
                Workspace Plan Tier (Testing & Dev)
              </label>
              <select
                value={plan}
                onChange={(e: any) => setPlan(e.target.value)}
                disabled={workspace?.role !== 'owner'}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: workspace?.role === 'owner' ? 'var(--input-bg)' : 'var(--card-border)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--text)',
                  fontSize: '0.84rem',
                  outline: 'none',
                  cursor: workspace?.role === 'owner' ? 'pointer' : 'not-allowed',
                }}
              >
                <option value="operator">Operator Tier (Automated Schedules & Action Execution Enabled)</option>
                <option value="pro">Pro Tier</option>
                <option value="free">Free Tier</option>
              </select>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Pre-billing mode: switch tiers freely to test automated schedules, action approvals, and brief quotas.
              </span>
            </div>
          </div>

          <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--card-border)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={15} />
              Change Password
            </h3>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
              Leave blank if you do not want to modify your password.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  New Password (min 6 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="dash-btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="dash-btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.8rem' }}
            >
              {isSaving ? 'Saving Changes...' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* WEEKLY DIGEST PREVIEW MODAL                                               */}
      {/* ========================================================================= */}
      {showDigestModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              border: '1px solid var(--card-border)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'var(--card-bg-subtle)',
                borderBottom: '1px solid var(--card-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#818cf8" />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    Weekly Intelligence Digest Preview
                  </h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Live rollup of briefs published in <strong>{workspace?.name || 'Workspace'}</strong> over the past 7 days.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDigestModal(false)}
                className="dash-btn-secondary"
                style={{ padding: '6px', borderRadius: '6px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isLoadingPreview ? (
                <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
                  <Loader2 size={24} className="animate-spin" />
                  <span style={{ fontSize: '0.86rem' }}>Generating live digest preview...</span>
                </div>
              ) : digestData ? (
                <>
                  {/* Quick Metric Bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ padding: '10px', background: 'var(--card-bg-subtle)', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--card-border)' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>{digestData.totalBriefs}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Briefs Published</div>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--card-bg-subtle)', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--card-border)' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>{digestData.totalClaims}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verified Claims</div>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--card-bg-subtle)', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--card-border)' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>{digestData.totalActions}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Proposed Actions</div>
                    </div>
                  </div>

                  {/* Rendered HTML Email Frame */}
                  <div
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid var(--card-border)',
                      background: '#0b0f19',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        background: '#0f172a',
                        borderBottom: '1px solid #334155',
                        fontSize: '0.72rem',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Subject: [Ballast] Weekly Intelligence Digest — {workspace?.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>HTML Template</span>
                    </div>

                    {digestPreviewHtml ? (
                      <iframe
                        srcDoc={digestPreviewHtml}
                        title="Digest Preview"
                        style={{
                          width: '100%',
                          height: '380px',
                          border: 'none',
                          backgroundColor: '#0b0f19',
                        }}
                      />
                    ) : (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No preview available.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Failed to load digest preview.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 20px',
                background: 'var(--card-bg-subtle)',
                borderTop: '1px solid var(--card-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Dispatched automatically on <strong>{prefs.digest_day || 'Monday'}s</strong> to subscribed members.
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowDigestModal(false)}
                  className="dash-btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSendTestDigest}
                  disabled={isSendingTest}
                  className="dash-btn-primary"
                  style={{ fontSize: '0.78rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  {isSendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  <span>Send Test Email</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
