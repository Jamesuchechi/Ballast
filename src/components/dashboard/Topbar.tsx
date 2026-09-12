'use client';

import React from 'react';
import Link from 'next/link';
import {
  Menu,
  Moon,
  Sun,
  PlusCircle,
  PanelRightOpen,
  PanelRightClose,
  Home,
  Globe,
  Sparkles,
} from 'lucide-react';

export interface TopbarProps {
  title?: string;
  subtitle?: string;
  mode: 'home' | 'world';
  onToggleMode?: () => void;
  onOpenMobileMenu: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  onCreateBrief: () => void;
  actionLoading?: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  isDemo?: boolean;
}

export function Topbar({
  title = 'Briefs Archive',
  subtitle,
  mode,
  onToggleMode,
  onOpenMobileMenu,
  isRightSidebarOpen,
  onToggleRightSidebar,
  onCreateBrief,
  actionLoading = false,
  theme,
  onToggleTheme,
  isDemo = false,
}: TopbarProps) {
  return (
    <header className="dash-topbar">
      {/* Left Area: Title + Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </span>
            {subtitle && (
              <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                — {subtitle}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
            Ballast OS &bull; Citations &amp; Evidence Grounded
          </span>
        </div>
      </div>

      {/* Right Area: Mode Switcher, Quick Action, Inspector Toggle, Theme */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Mode Toggle (Home / World) */}
        {onToggleMode && (
          <button
            onClick={onToggleMode}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'home' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(6, 182, 212, 0.12)',
              color: mode === 'home' ? '#34d399' : '#22d3ee',
              border: mode === 'home' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(6, 182, 212, 0.3)',
              transition: 'all 0.15s ease',
            }}
            title="Toggle between Home mode (private sources only) and World mode (web augmented)"
          >
            {mode === 'home' ? (
              <>
                <Home size={14} color="#10b981" />
                <span>Home Mode</span>
              </>
            ) : (
              <>
                <Globe size={14} color="#06b6d4" />
                <span>World Mode</span>
              </>
            )}
          </button>
        )}

        {/* Demo banner quick sign up */}
        {isDemo && (
          <Link
            href="/signup"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              textDecoration: 'none',
            }}
          >
            <Sparkles size={13} />
            <span>Create Account</span>
          </Link>
        )}

        {/* Create / Seed Brief button */}
        <button
          onClick={onCreateBrief}
          disabled={actionLoading}
          className="dash-btn-primary"
          style={{
            opacity: actionLoading ? 0.6 : 1,
            background: mode === 'world' ? 'linear-gradient(135deg, #0891b2, #06b6d4)' : undefined,
            borderColor: mode === 'world' ? '#0891b2' : undefined,
          }}
          title={`Seed a verified canonical brief for ${mode} mode`}
        >
          <PlusCircle size={15} />
          <span>Seed {mode === 'world' ? 'World' : 'Home'} Brief</span>
        </button>

        {/* Right Sidebar Context Inspector Toggle */}
        <button
          onClick={onToggleRightSidebar}
          className="dash-icon-btn"
          style={{
            background: isRightSidebarOpen ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
            color: isRightSidebarOpen ? '#34d399' : 'var(--text-muted)',
            borderColor: isRightSidebarOpen ? 'rgba(16, 185, 129, 0.3)' : 'var(--card-border)',
          }}
          title={isRightSidebarOpen ? 'Close context inspector' : 'Open context inspector'}
          aria-label="Toggle Context Inspector"
        >
          {isRightSidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="dash-icon-btn"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={18} color="#facc15" /> : <Moon size={18} color="#6366f1" />}
        </button>
      </div>
    </header>
  );
}
