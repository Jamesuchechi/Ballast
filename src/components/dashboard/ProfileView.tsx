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
} from 'lucide-react';

interface ProfileViewProps {
  initialUser?: any;
  initialWorkspace?: any;
  onLogout?: () => void;
  onProfileUpdated?: (user: any, workspace: any) => void;
}

export function ProfileView({
  initialUser,
  initialWorkspace,
  onLogout,
  onProfileUpdated,
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

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
    </div>
  );
}
