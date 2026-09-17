'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { RightSidebar } from './RightSidebar';
import { MobileHeader } from './MobileHeader';
import { MobileBottomBar } from './MobileBottomBar';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  user: any;
  workspace: any;
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
  activeSection: string;
  onSelectSection: (section: string) => void;
  mode: 'home' | 'world';
  onToggleMode?: () => void;
  title?: string;
  subtitle?: string;
  currentBrief?: any;
  citations?: any[];
  runs?: any;
  onCreateBrief: () => void;
  actionLoading?: boolean;
  onLogout?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  isDemo?: boolean;
  onWorkspaceSwitched?: () => void;
  onResolveConflict?: (citationId: string, resolutionType: 'confirmed_accurate' | 'dismissed') => Promise<void> | void;
}

export function DashboardLayout({
  children,
  user,
  workspace,
  briefsCount,
  pendingActionsCount,
  sourcesCount,
  schedulesCount,
  accessLogsCount,
  flagsCount,
  telemetryAvgLatency,
  storageCount,
  notificationsCount,
  unreadNotificationsCount,
  activeSection,
  onSelectSection,
  mode,
  onToggleMode,
  title,
  subtitle,
  currentBrief,
  citations = [],
  runs,
  onCreateBrief,
  actionLoading = false,
  onLogout,
  theme,
  onToggleTheme,
  isDemo = false,
  onWorkspaceSwitched,
  onResolveConflict,
}: DashboardLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Ping background worker to wake up from Render free-tier sleep
  useEffect(() => {
    fetch('/api/worker/wake').catch(() => {});
  }, []);

  return (
    <div className="dash-shell dash-root">
      {/* Mobile Top Header (<768px) */}
      <MobileHeader
        onOpenSidebar={() => setIsMobileSidebarOpen(true)}
        onToggleContext={() => setIsRightSidebarOpen((prev) => !prev)}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onCreateBrief={onCreateBrief}
      />

      {/* Main Frame */}
      <div className="dash-body dash-app-container">
        {/* Left Sidebar */}
        <Sidebar
          user={user}
          workspace={workspace}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          briefsCount={briefsCount}
          pendingActionsCount={pendingActionsCount}
          sourcesCount={sourcesCount}
          schedulesCount={schedulesCount}
          accessLogsCount={accessLogsCount}
          flagsCount={flagsCount}
          telemetryAvgLatency={telemetryAvgLatency}
          storageCount={storageCount}
          notificationsCount={notificationsCount}
          unreadNotificationsCount={unreadNotificationsCount}
          onCreateBrief={onCreateBrief}
          actionLoading={actionLoading}
          onLogout={onLogout}
          isDemo={isDemo}
          onWorkspaceSwitched={onWorkspaceSwitched}
        />

        {/* Center Main Stage */}
        <div className="dash-stage">
          {/* Desktop Topbar (>=768px) */}
          <Topbar
            title={title}
            subtitle={subtitle}
            mode={mode}
            onToggleMode={onToggleMode}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
            isRightSidebarOpen={isRightSidebarOpen}
            onToggleRightSidebar={() => setIsRightSidebarOpen((prev) => !prev)}
            onCreateBrief={onCreateBrief}
            actionLoading={actionLoading}
            theme={theme}
            onToggleTheme={onToggleTheme}
            isDemo={isDemo}
          />

          {/* Page Body Scroll Area */}
          <main className="dash-scroll">
            {children}
          </main>
        </div>

        {/* Right Sidebar (Context Inspector) */}
        <RightSidebar
          isOpen={isRightSidebarOpen}
          onClose={() => setIsRightSidebarOpen(false)}
          brief={currentBrief}
          citations={citations}
          runs={runs}
          onResolveConflict={onResolveConflict}
        />
      </div>

      {/* Mobile Bottom Navigation Bar (<768px) */}
      <MobileBottomBar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        onCreateBrief={onCreateBrief}
        pendingActionsCount={pendingActionsCount}
        unreadNotificationsCount={unreadNotificationsCount}
      />
    </div>
  );
}
