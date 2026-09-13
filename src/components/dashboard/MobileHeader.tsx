'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, Layers, Sun, Moon, PlusCircle } from 'lucide-react';
import { BallastLogo } from '@/components/brand/BallastLogo';

export interface MobileHeaderProps {
  onOpenSidebar: () => void;
  onToggleContext: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onCreateBrief: () => void;
}

export function MobileHeader({
  onOpenSidebar,
  onToggleContext,
  theme,
  onToggleTheme,
  onCreateBrief,
}: MobileHeaderProps) {
  return (
    <header className="dash-mobile-header">
      {/* Left: Hamburger + Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={onOpenSidebar}
          className="dash-icon-btn"
          aria-label="Open Navigation Drawer"
        >
          <Menu size={20} />
        </button>

        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <BallastLogo size={24} />
        </Link>
      </div>

      {/* Right: Theme, Context Inspector, New Brief */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={onToggleTheme}
          className="dash-icon-btn"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={17} color="#facc15" /> : <Moon size={17} color="#6366f1" />}
        </button>

        <button
          onClick={onToggleContext}
          className="dash-icon-btn"
          title="Context Inspector"
          aria-label="Toggle Context Inspector"
        >
          <Layers size={17} />
        </button>

        <button
          onClick={onCreateBrief}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 10px',
            borderRadius: '7px',
            background: '#10b981',
            color: '#050608',
            border: 'none',
            fontWeight: 600,
            fontSize: '0.78rem',
            cursor: 'pointer',
            marginLeft: '4px',
            gap: '4px',
          }}
          title="New Brief"
          aria-label="New Brief"
        >
          <PlusCircle size={15} />
          <span>New</span>
        </button>
      </div>
    </header>
  );
}
