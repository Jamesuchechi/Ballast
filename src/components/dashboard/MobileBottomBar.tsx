'use client';

import React from 'react';
import {
  FileText,
  CheckSquare,
  Plus,
  Layers,
  Database,
} from 'lucide-react';

export interface MobileBottomBarProps {
  activeSection: string;
  onSelectSection: (section: string) => void;
  onToggleContext: () => void;
  onCreateBrief: () => void;
  pendingActionsCount?: number;
}

export function MobileBottomBar({
  activeSection,
  onSelectSection,
  onToggleContext,
  onCreateBrief,
  pendingActionsCount = 0,
}: MobileBottomBarProps) {
  return (
    <nav className="dash-bottom-bar">
      {/* Briefs Tab */}
      <button
        onClick={() => onSelectSection('briefs')}
        className={`dash-bottom-btn ${activeSection === 'briefs' ? 'is-active' : ''}`}
      >
        <FileText size={19} />
        <span>Briefs</span>
      </button>

      {/* Actions Tab */}
      <button
        onClick={() => onSelectSection('actions')}
        className={`dash-bottom-btn ${activeSection === 'actions' ? 'is-active' : ''}`}
      >
        <CheckSquare size={19} />
        <span>Actions</span>
        {pendingActionsCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '2px',
              width: '15px',
              height: '15px',
              borderRadius: '50%',
              backgroundColor: '#f59e0b',
              color: '#000000',
              fontWeight: 700,
              fontSize: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {pendingActionsCount}
          </span>
        )}
      </button>

      {/* Floating Center (+) New Brief Button */}
      <button
        onClick={onCreateBrief}
        className="dash-bottom-fab"
        aria-label="Create New Brief"
        title="Create New Brief"
      >
        <Plus size={24} strokeWidth={2.8} />
      </button>

      {/* Context Inspector Tab */}
      <button
        onClick={onToggleContext}
        className="dash-bottom-btn"
        title="Context Inspector"
      >
        <Layers size={19} />
        <span>Context</span>
      </button>

      {/* Sources Tab */}
      <button
        onClick={() => onSelectSection('sources')}
        className={`dash-bottom-btn ${activeSection === 'sources' ? 'is-active' : ''}`}
      >
        <Database size={19} />
        <span>Sources</span>
      </button>
    </nav>
  );
}
