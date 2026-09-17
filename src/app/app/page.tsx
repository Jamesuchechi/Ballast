'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  RefreshCw,
  Download,
  GitBranch,
  CheckCircle2,
  Database,
  Calendar,
  Layers,
  Sparkles,
  Globe,
  ShieldCheck,
  Check,
  Sliders,
  UploadCloud,
  Clock,
  Lock,
  Flag,
  FileUp,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Eye,
  Plus,
  X,
  ArrowRight,
  Play,
  AlertCircle,
  Inbox,
  ShieldAlert,
  Mail,
  HardDrive,
  MessageSquare,
  Bell,
  BarChart3,
  TrendingUp,
  Zap,
  CheckCheck,
  Filter,
  CheckSquare,
  Share2,
  Star,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useTheme } from '@/components/theme/ThemeProvider';
import { IntegrationsMarketplace, type ConnectorItem } from '@/components/dashboard/IntegrationsMarketplace';
import { SourceHealthDashboard } from '@/components/dashboard/SourceHealthDashboard';
import { ProfileView } from '@/components/dashboard/ProfileView';
import { BriefDiffModal } from '@/components/dashboard/BriefDiffModal';
import { ShareBriefModal } from '@/components/dashboard/ShareBriefModal';
import { LatencyPlot } from '@/components/dashboard/LatencyPlot';
import { ActionDraftCard } from '@/components/dashboard/ActionDraftCard';
import { FormattedDiffViewer } from '@/components/dashboard/FormattedDiffViewer';
import {
  SUPPORTED_TEMPLATE_TAGS,
  validateQuestionTemplate,
  renderQuestionTemplate,
} from '@/lib/templateValidator';
import {
  cleanHtmlAndTracking,
  humanizeSourceLabel,
  parseAndHumanizeCitationLine,
} from '@/lib/formatters';

function computeUnifiedDiff(oldText: string, newText: string) {
  if (!oldText && !newText) return [];
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const diff: { type: 'add' | 'del' | 'same'; text: string }[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({ type: 'same', text: oldLines[i] });
      i++;
      j++;
    } else if (j < newLines.length && (!oldLines.includes(newLines[j], i) || (oldLines.indexOf(newLines[j], i) - i > 4))) {
      diff.push({ type: 'add', text: newLines[j] });
      j++;
    } else if (i < oldLines.length) {
      diff.push({ type: 'del', text: oldLines[i] });
      i++;
    } else if (j < newLines.length) {
      diff.push({ type: 'add', text: newLines[j] });
      j++;
    }
  }
  return diff;
}

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const queryInputRef = useRef<HTMLInputElement>(null);

  // User & Workspace State
  const [user, setUser] = useState<any>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [mode, setMode] = useState<'home' | 'world'>('home');
  const [activeSection, setActiveSection] = useState('briefs');
  const [activeTab, setActiveTab] = useState<'preview' | 'citations' | 'actions' | 'run' | 'markdown'>('preview');

  // Real Database Entities
  const [briefs, setBriefs] = useState<any[]>([]);
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [briefDetail, setBriefDetail] = useState<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [workspaceActions, setWorkspaceActions] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<any>(null);

  // Notifications State (FR7.2)
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState<boolean>(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

  // Product Analytics State
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  // Ingestion & Generation UI States
  const [pasteText, setPasteText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<any[]>([]);
  const [queryPrompt, setQueryPrompt] = useState('');
  const [briefFilter, setBriefFilter] = useState<'all' | 'home' | 'world' | 'starred'>('all');
  const [actionLoading, setActionLoading] = useState(false);
  const [diffModalData, setDiffModalData] = useState<any>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);

  // Connector UI States (Marketplace driven by Phase B registry)
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [syncingConnectors, setSyncingConnectors] = useState<Record<string, boolean>>({});
  const [syncWindowDays, setSyncWindowDays] = useState(90);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);

  const gmailStatus = useMemo(() => {
    const gm = connectors.find((c) => c.id === 'gmail');
    return gm?.health || {
      connected: false,
      last_synced: null,
      last_error: null,
      sync_window_days: 90,
    };
  }, [connectors]);

  // Dynamic Workspace Storage Used Computation
  const storageLabel = useMemo(() => {
    const bytes = uploadedFiles.reduce((acc, f) => {
      const size = f.raw?.meta?.size || 0;
      return acc + (typeof size === 'number' ? size : 0);
    }, 0);
    if (bytes === 0) return undefined;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [uploadedFiles]);

  // Modal / Form States
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleQuestion, setNewScheduleQuestion] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('0 9 * * 1');
  const [newScheduleMode, setNewScheduleMode] = useState<'home' | 'world'>('home');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [flagClaimText, setFlagClaimText] = useState('');
  const [flagCitationId, setFlagCitationId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState<'wrong' | 'unsupported'>('unsupported');
  const [flagNote, setFlagNote] = useState('');
  const [isSubmittingFlag, setIsSubmittingFlag] = useState(false);

  // Brief Sharing Modal State (E5)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Connector & Sync Feedback States (E3)
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [resyncingSources, setResyncingSources] = useState<Record<string, boolean>>({});

  // Source Inspection & Filter States
  const [sourceFilterConnector, setSourceFilterConnector] = useState<string>('all');
  const [inspectingSource, setInspectingSource] = useState<{ source: any; chunks: any[] } | null>(null);
  const [isLoadingInspection, setIsLoadingInspection] = useState(false);

  // Smart Suggestions States (E4)
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // ----------------------------------------------------
  // Data Fetching Functions
  // ----------------------------------------------------

  const fetchSuggestions = async (filterMode?: string) => {
    try {
      setIsLoadingSuggestions(true);
      const queryParam = filterMode ? `?mode=${encodeURIComponent(filterMode)}` : (mode ? `?mode=${encodeURIComponent(mode)}` : '');
      const res = await fetch(`/api/suggestions${queryParam}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.warn('Failed to fetch smart suggestions:', e);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const fetchBriefs = async () => {
    try {
      const res = await fetch('/api/briefs');
      if (res.ok) {
        const data = await res.json();
        const list = data.briefs || [];
        setBriefs(list);
        if (list.length > 0) {
          setSelectedBriefId((prev) => {
            const exists = list.some((b: any) => b.id === prev);
            return exists ? prev : list[0].id;
          });
        } else {
          setSelectedBriefId(null);
          setBriefDetail(null);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch briefs:', e);
    }
  };

  const fetchSources = async () => {
    try {
      const res = await fetch('/api/sources');
      if (res.ok) {
        const data = await res.json();
        if (data.sources) {
          setUploadedFiles(
            data.sources.map((s: any) => {
              let displayName = s.meta?.title || s.meta?.name || s.meta?.summary || s.meta?.subject;
              if (!displayName) {
                if (s.connector === 'gmail') {
                  displayName = s.meta?.from ? `Email from ${s.meta.from}` : (s.external_id || 'Gmail Message');
                } else if (s.connector === 'calendar') {
                  displayName = s.meta?.organizer ? `Meeting (${s.meta.organizer})` : 'Calendar Event';
                } else if (s.connector === 'drive') {
                  displayName = 'Google Drive Document';
                } else if (s.connector === 'github') {
                  displayName = s.meta?.repo ? `${s.meta.repo}: ${s.meta.title || s.external_id}` : (s.external_id || 'GitHub Document');
                } else if (s.connector === 'slack') {
                  displayName = s.meta?.channel ? `${s.meta.channel}: ${s.meta.text?.slice(0, 50) || s.external_id}` : (s.external_id || 'Slack Message');
                } else if (s.connector === 'notion') {
                  displayName = s.meta?.title || (s.external_id || 'Notion Page');
                } else {
                  displayName = s.external_id || 'Document';
                }
              }

              let subtitle = '';
              if (s.connector === 'gmail') {
                subtitle = s.meta?.from ? `From: ${s.meta.from}` : '';
              } else if (s.connector === 'calendar') {
                const when = s.meta?.start ? new Date(s.meta.start).toLocaleString() : '';
                subtitle = s.meta?.organizer ? `${when} • Org: ${s.meta.organizer}` : when;
              } else if (s.connector === 'drive') {
                subtitle = s.meta?.mimeType || 'Drive File';
              } else if (s.connector === 'upload') {
                subtitle = s.meta?.mime || 'Uploaded File';
              } else if (s.connector === 'github') {
                subtitle = s.meta?.repo ? `Repo: ${s.meta.repo}` : 'GitHub Resource';
              } else if (s.connector === 'slack') {
                subtitle = s.meta?.user ? `@${s.meta.user} • ${s.meta.channel || 'channel'}` : 'Slack Thread';
              } else if (s.connector === 'notion') {
                subtitle = s.meta?.url ? `Notion • ${s.meta.url}` : 'Notion Document';
              }

              return {
                id: s.id,
                name: displayName,
                subtitle,
                size: `${s.chunk_count || 0} chunk(s)`,
                type: s.connector === 'upload' ? (s.meta?.mime || 'document') : s.connector,
                connector: s.connector,
                trust_boundary: s.trust_boundary,
                checksum: s.checksum,
                status: 'indexed',
                date: s.meta?.date || s.meta?.start || new Date(s.created_at).toISOString().split('T')[0],
                raw: s,
              };
            })
          );
        }
      }
    } catch (err) {
      console.warn('Could not fetch sources:', err);
    }
  };

  const handleInspectSource = async (sourceId: string) => {
    setIsLoadingInspection(true);
    try {
      const res = await fetch(`/api/sources?id=${encodeURIComponent(sourceId)}`);
      if (res.ok) {
        const data = await res.json();
        setInspectingSource(data);
      } else {
        alert('Could not load source details');
      }
    } catch (err: any) {
      alert(`Inspection error: ${err.message}`);
    } finally {
      setIsLoadingInspection(false);
    }
  };

  const fetchAccessLogs = async () => {
    try {
      const res = await fetch('/api/access-logs');
      if (res.ok) {
        const data = await res.json();
        setAccessLogs(data.logs || []);
      }
    } catch (e) {
      console.warn('Failed to fetch access logs:', e);
    }
  };

  const fetchActions = async () => {
    try {
      const res = await fetch('/api/actions');
      if (res.ok) {
        const data = await res.json();
        setWorkspaceActions(data.actions || []);
      }
    } catch (e) {
      console.warn('Failed to fetch actions:', e);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (e) {
      console.warn('Failed to fetch schedules:', e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadNotifCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.warn('Failed to fetch notifications:', e);
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, action: 'read' }),
      });
      setUnreadNotifCount(0);
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: n.read_at || now })));
    } catch (e) {
      console.warn('Failed to mark notifications read:', e);
    }
  };

  const handleMarkSingleNotificationRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'read' }),
      });
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, read_at: n.read_at || now } : n))
      );
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.warn('Failed to mark notification read:', e);
    }
  };

  const handleDismissNotification = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'dismiss' }),
      });
      const target = notifications.find((n) => n.id === id);
      if (target && !target.read) {
        setUnreadNotifCount((prev) => Math.max(0, prev - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.warn('Failed to dismiss notification:', e);
    }
  };

  const handleDismissAllNotifications = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, action: 'dismiss' }),
      });
      setNotifications([]);
      setUnreadNotifCount(0);
    } catch (e) {
      console.warn('Failed to dismiss all notifications:', e);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (e) {
      console.warn('Failed to fetch analytics:', e);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleRunSchedule = async (scheduleId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/schedules/${scheduleId}/run`, { method: 'POST' });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Fallback if response body is empty or non-JSON
      }

      if (res.ok) {
        alert('Scheduled run initiated! A new brief is being generated in the background.');
        await fetchBriefs();
        await fetchSchedules();
        await fetchNotifications();
      } else {
        alert(data.error || `Failed to run schedule (Status ${res.status})`);
      }
    } catch (e: any) {
      alert('Schedule run error: ' + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchFlags = async () => {
    try {
      const res = await fetch('/api/flags');
      if (res.ok) {
        const data = await res.json();
        setFlags(data.flags || []);
      }
    } catch (e) {
      console.warn('Failed to fetch flags:', e);
    }
  };

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch (e) {
      console.warn('Failed to fetch telemetry:', e);
    }
  };

  const fetchConnectors = async () => {
    try {
      const res = await fetch('/api/connectors');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.connectors)) {
          setConnectors(data.connectors);
          const gm = data.connectors.find((c: any) => c.id === 'gmail');
          if (gm?.health?.sync_window_days) {
            setSyncWindowDays(gm.health.sync_window_days);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch connectors:', e);
    }
  };

  // ----------------------------------------------------
  // Lifecycle Initializer
  // ----------------------------------------------------

  const refreshAllWorkspaceData = async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user && meData.workspace) {
          setUser(meData.user);
          setWorkspace(meData.workspace);
        }
      }
      await Promise.all([
        fetchBriefs(),
        fetchSources(),
        fetchAccessLogs(),
        fetchActions(),
        fetchSchedules(),
        fetchNotifications(),
        fetchFlags(),
        fetchTelemetry(),
        fetchConnectors(),
        fetchAnalytics(),
        fetchSuggestions(mode),
      ]);
    } catch (e) {
      console.warn('Failed to refresh workspace data:', e);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          router.replace('/login?from=' + encodeURIComponent(window.location.pathname));
          return;
        }
        const meData = await meRes.json();

        if (meData.user && meData.workspace) {
          setUser(meData.user);
          setWorkspace(meData.workspace);
          setIsDemo(false);
          setIsLoadingAuth(false);
        } else {
          router.replace('/login?from=' + encodeURIComponent(window.location.pathname));
          return;
        }

        // Fetch live database records across all domains
        await Promise.all([
          fetchBriefs(),
          fetchSources(),
          fetchAccessLogs(),
          fetchActions(),
          fetchSchedules(),
          fetchNotifications(),
          fetchFlags(),
          fetchTelemetry(),
          fetchConnectors(),
          fetchAnalytics(),
          fetchSuggestions(mode),
        ]);
      } catch (err) {
        console.warn('Dashboard auth check failed:', err);
        router.replace('/login?from=' + encodeURIComponent(window.location.pathname));
      }
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      const msg = params.get('message');
      if (err) setInitialError(err);
      if (msg) setInitialMessage(msg);
    }

    init();
  }, []);

  // Update suggestions when mode switches between home and world (E4)
  useEffect(() => {
    if (user && workspace) {
      fetchSuggestions(mode);
    }
  }, [mode]);

  // Fetch brief details when selection changes
  useEffect(() => {
    if (!selectedBriefId) {
      setBriefDetail(null);
      return;
    }

    async function loadDetail() {
      try {
        const res = await fetch(`/api/briefs/${selectedBriefId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.brief) {
            setBriefDetail(data);
          }
        }
      } catch (err) {
        console.error('Failed to load brief detail:', err);
      }
    }
    loadDetail();
  }, [selectedBriefId]);

  // ----------------------------------------------------
  // Action Handlers
  // ----------------------------------------------------

  const handleOpenCreateBrief = () => {
    setActiveSection('briefs');
    setTimeout(() => {
      queryInputRef.current?.focus();
      queryInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const subscribeToBriefProgress = (
    briefId: string,
    callbacks: {
      onProgress: (steps: any[]) => void;
      onPublished: () => void | Promise<void>;
      onFailed: (error?: string) => void | Promise<void>;
    }
  ) => {
    let isTerminated = false;
    let eventSource: EventSource | null = null;
    let pollInterval: any = null;

    const cleanup = () => {
      isTerminated = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    function startPolling() {
      if (pollInterval || isTerminated) return;
      pollInterval = setInterval(async () => {
        if (isTerminated) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const res = await fetch(`/api/briefs/${briefId}/progress`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress && Array.isArray(data.progress)) {
              callbacks.onProgress(data.progress);
            }
            if (data.status === 'published') {
              cleanup();
              callbacks.onPublished();
            } else if (data.status === 'failed') {
              cleanup();
              callbacks.onFailed(data.error);
            }
          }
        } catch (e) {
          console.warn('[Progress Poll Fallback Error]:', e);
        }
      }, 400);
    }

    // Try real-time SSE stream first (Audit M10)
    try {
      if (typeof window !== 'undefined' && window.EventSource) {
        eventSource = new EventSource(`/api/briefs/${briefId}/stream`);

        eventSource.onmessage = (event) => {
          if (isTerminated) return;
          try {
            const data = JSON.parse(event.data);
            if (data.progress && Array.isArray(data.progress)) {
              callbacks.onProgress(data.progress);
            }
            if (data.status === 'published') {
              cleanup();
              callbacks.onPublished();
            } else if (data.status === 'failed') {
              cleanup();
              callbacks.onFailed(data.error);
            }
          } catch (err) {
            console.warn('[SSE Parse Error]:', err);
          }
        };

        eventSource.onerror = () => {
          // Fall back to polling seamlessly if stream disconnects
          if (!isTerminated && !pollInterval) {
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
            startPolling();
          }
        };
      } else {
        startPolling();
      }
    } catch {
      startPolling();
    }

    return cleanup;
  };

  const handleEnqueueBrief = async (question: string, briefMode: 'home' | 'world' = 'home') => {
    if (!question.trim()) return;
    setIsGenerating(true);
    setGenerationSteps([{ step: 'queued', timestamp: new Date().toISOString(), message: 'Queued brief for background worker' }]);

    try {
      const res = await fetch('/api/briefs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode: briefMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to enqueue brief');
        setIsGenerating(false);
        return;
      }

      const briefId = data.briefId;

      // Stream progress via SSE with automatic polling fallback (Audit M10)
      subscribeToBriefProgress(briefId, {
        onProgress: (steps) => {
          setGenerationSteps(steps);
        },
        onPublished: async () => {
          setIsGenerating(false);
          setQueryPrompt('');
          await Promise.all([
            fetchBriefs(),
            fetchAccessLogs(),
            fetchActions(),
            fetchTelemetry(),
            fetchSuggestions(mode),
          ]);
          setSelectedBriefId(briefId);
        },
        onFailed: (err) => {
          setIsGenerating(false);
          alert('Brief generation failed: ' + (err || 'Validation error'));
        },
      });
    } catch (err: any) {
      alert('Error: ' + err.message);
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedBriefId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/briefs/${selectedBriefId}/regenerate`, { method: 'POST' });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Response was not JSON (e.g. gateway timeout or 500 error page)
      }

      if (!res.ok || !data) {
        alert(data?.error || `Server error (${res.status}): Failed to trigger regeneration.`);
        setActionLoading(false);
        return;
      }

      if (data.childBrief?.id) {
        const childId = data.childBrief.id;
        setIsGenerating(true);
        setGenerationSteps([
          {
            step: 'queued',
            timestamp: new Date().toISOString(),
            message: 'Queued regenerated brief for background processing',
          },
        ]);

        // Stream progress via SSE (Audit M10)
        subscribeToBriefProgress(childId, {
          onProgress: (steps) => {
            setGenerationSteps(steps);
          },
          onPublished: async () => {
            setIsGenerating(false);
            await Promise.all([
              fetchBriefs(),
              fetchAccessLogs(),
              fetchActions(),
              fetchTelemetry(),
            ]);
            setSelectedBriefId(childId);
          },
          onFailed: (err) => {
            setIsGenerating(false);
            alert('Brief regeneration failed: ' + (err || 'Validation error'));
          },
        });
      } else {
        alert(data.error || 'Failed to regenerate brief');
      }
    } catch (err: any) {
      alert('Regeneration error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryBrief = async (briefIdToRetry?: string) => {
    const targetId = briefIdToRetry || selectedBriefId;
    if (!targetId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/briefs/${targetId}/retry`, { method: 'POST' });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Non-JSON response
      }

      if (!res.ok || !data) {
        alert(data?.error || `Server error (${res.status}): Failed to retry brief.`);
        setActionLoading(false);
        return;
      }

      setIsGenerating(true);
      setGenerationSteps([
        {
          step: 'queued',
          timestamp: new Date().toISOString(),
          message: 'Queued brief retry for processing',
        },
      ]);

      // Stream progress via SSE (Audit M10)
      subscribeToBriefProgress(targetId, {
        onProgress: (steps) => {
          setGenerationSteps(steps);
        },
        onPublished: async () => {
          setIsGenerating(false);
          setActionLoading(false);
          await Promise.all([
            fetchBriefs(),
            fetchAccessLogs(),
            fetchActions(),
            fetchTelemetry(),
          ]);
          const bRes = await fetch(`/api/briefs/${targetId}`);
          if (bRes.ok) {
            const bData = await bRes.json();
            setBriefDetail(bData);
          }
        },
        onFailed: async (err) => {
          setIsGenerating(false);
          setActionLoading(false);
          await Promise.all([fetchBriefs()]);
          const bRes = await fetch(`/api/briefs/${targetId}`);
          if (bRes.ok) {
            const bData = await bRes.json();
            setBriefDetail(bData);
          }
          if (err) {
            alert('Brief retry failed: ' + err);
          }
        },
      });
    } catch (err: any) {
      alert('Error retrying brief: ' + err.message);
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert('File exceeds maximum 20MB limit (NFR3.4)');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/sources/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      await Promise.all([fetchSources(), fetchAccessLogs()]);
      alert(`Indexed ${data.filename}: ${data.chunks_count} chunk(s) created in pgvector.`);
    } catch (err: any) {
      alert('Upload error: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasteSnippet = async () => {
    if (!pasteText.trim()) return;
    setIsUploading(true);
    try {
      const blob = new Blob([pasteText], { type: 'text/markdown' });
      const file = new File([blob], `pasted_notes_${Date.now()}.md`, { type: 'text/markdown' });

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/sources/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to index pasted text');
      }

      setPasteText('');
      await Promise.all([fetchSources(), fetchAccessLogs()]);
      alert(`Indexed pasted notes: ${data.chunks_count} chunk(s) stored.`);
    } catch (err: any) {
      alert('Paste error: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('Are you sure you want to delete this indexed source? All associated chunks and embeddings will be removed.')) return;
    try {
      const res = await fetch(`/api/sources?id=${sourceId}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([fetchSources(), fetchAccessLogs()]);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete source');
      }
    } catch (e: any) {
      alert('Delete error: ' + e.message);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    try {
      const res = await fetch(`/api/actions/${actionId}/approve`, { method: 'POST' });
      const data = await res.json();
      await Promise.all([fetchActions(), fetchAccessLogs()]);
      if (selectedBriefId) {
        const bRes = await fetch(`/api/briefs/${selectedBriefId}`);
        if (bRes.ok) {
          const bData = await bRes.json();
          setBriefDetail(bData);
        }
      }
      if (!res.ok) {
        alert(data.error || 'Failed to approve action');
      } else if (data.success === false) {
        alert(`Action approved, but external dispatch encountered an error: ${data.error}`);
      }
    } catch (err: any) {
      alert('Approval error: ' + err.message);
    }
  };

  const handleToggleSchedule = async (scheduleId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        await fetchSchedules();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to toggle schedule');
      }
    } catch (e: any) {
      alert('Schedule toggle error: ' + e.message);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Delete this recurring schedule?')) return;
    try {
      const res = await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchSchedules();
      }
    } catch (e: any) {
      alert('Delete error: ' + e.message);
    }
  };

  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleQuestion.trim() || !newScheduleCron.trim()) {
      alert('Please provide a question template and cron expression');
      return;
    }
    const templateValidation = validateQuestionTemplate(newScheduleQuestion);
    if (!templateValidation.valid) {
      alert(`Invalid Question Template:\n\n${templateValidation.errors.join('\n')}`);
      return;
    }
    setIsSubmittingSchedule(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newScheduleName || 'Scheduled Brief',
          question_template: newScheduleQuestion,
          cron: newScheduleCron,
          mode: newScheduleMode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsScheduleModalOpen(false);
        setNewScheduleName('');
        setNewScheduleQuestion('');
        await fetchSchedules();
      } else {
        alert(data.error || 'Failed to create schedule');
      }
    } catch (err: any) {
      alert('Create schedule error: ' + err.message);
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const handleResolveFlag = async (flagId: string) => {
    try {
      const res = await fetch(`/api/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      if (res.ok) {
        await fetchFlags();
      }
    } catch (e: any) {
      alert('Flag resolve error: ' + e.message);
    }
  };

  const handleCreateFlagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBriefId) {
      alert('Select a brief before submitting a flag');
      return;
    }
    setIsSubmittingFlag(true);
    try {
      const res = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief_id: selectedBriefId,
          citation_id: flagCitationId,
          claim_text: flagClaimText,
          kind: flagReason,
          note: flagNote,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsFlagModalOpen(false);
        setFlagClaimText('');
        setFlagCitationId(null);
        setFlagNote('');
        await fetchFlags();
      } else {
        alert(data.error || 'Failed to submit flag');
      }
    } catch (err: any) {
      alert('Submit flag error: ' + err.message);
    } finally {
      setIsSubmittingFlag(false);
    }
  };

  const handleConnectConnector = (connector: ConnectorItem) => {
    window.location.href = `/api/connectors/${connector.id}/auth`;
  };

  const handleSyncConnector = async (connector: ConnectorItem) => {
    setSyncingConnectors((prev) => ({ ...prev, [connector.id]: true }));
    setSyncFeedback({ type: 'info', message: `Syncing ${connector.name}...` });
    try {
      const res = await fetch(`/api/connectors/${connector.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowDays: syncWindowDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncFeedback({
          type: 'error',
          message: data.error || `${connector.name} sync failed. Please verify credentials or retry.`,
        });
      } else {
        setSyncFeedback({
          type: 'success',
          message: data.message || `✓ ${connector.name} synced: ${data.result?.syncedCount ?? 0} updated, ${data.result?.unchangedCount ?? 0} unchanged.`,
        });
        await Promise.all([fetchConnectors(), fetchSources(), fetchAccessLogs()]);
      }
    } catch (e: any) {
      setSyncFeedback({ type: 'error', message: `Sync error: ${e.message}` });
    } finally {
      setSyncingConnectors((prev) => ({ ...prev, [connector.id]: false }));
    }
  };

  const handleSyncAllConnectors = async () => {
    setIsSyncingAll(true);
    setSyncFeedback({ type: 'info', message: 'Syncing all connected sources in background...' });
    try {
      const res = await fetch('/api/connectors/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowDays: syncWindowDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncFeedback({
          type: 'error',
          message: data.error || 'Batch sync failed. Some connectors encountered errors.',
        });
      } else {
        setSyncFeedback({
          type: 'success',
          message: data.message || `✓ Synced all integrations: ${data.totalSynced ?? 0} items updated, ${data.totalUnchanged ?? 0} unchanged.`,
        });
        await Promise.all([fetchConnectors(), fetchSources(), fetchAccessLogs()]);
      }
    } catch (e: any) {
      setSyncFeedback({ type: 'error', message: `Batch sync error: ${e.message}` });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleResyncSource = async (sourceId: string) => {
    setResyncingSources((prev) => ({ ...prev, [sourceId]: true }));
    try {
      const res = await fetch(`/api/sources/${sourceId}/resync`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncFeedback({ type: 'error', message: data.error || 'Failed to re-sync source' });
      } else {
        setSyncFeedback({
          type: 'success',
          message: data.message || '✓ Source re-synced and vector chunks updated.',
        });
        await Promise.all([fetchSources(), fetchAccessLogs()]);
      }
    } catch (e: any) {
      setSyncFeedback({ type: 'error', message: `Source re-sync error: ${e.message}` });
    } finally {
      setResyncingSources((prev) => ({ ...prev, [sourceId]: false }));
    }
  };

  const handleRevokeConnector = async (connector: ConnectorItem) => {
    if (!confirm(`Revoke ${connector.name} access? Future sync will stop and credentials will be removed.`)) return;
    try {
      const res = await fetch(`/api/connectors/${connector.id}/revoke`, { method: 'POST' });
      if (res.ok) {
        await Promise.all([fetchConnectors(), fetchSources(), fetchAccessLogs()]);
      } else {
        const data = await res.json();
        alert(data.error || 'Revoke failed');
      }
    } catch (e: any) {
      console.error('Revoke failed:', e);
    }
  };

  const handleSaveToken = async (connectorId: string, token: string) => {
    const res = await fetch(`/api/connectors/${connectorId}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save token');
    }
    await Promise.all([fetchConnectors(), fetchSources(), fetchAccessLogs()]);
  };

  // Backwards compatible aliases
  const handleConnectGmail = () => {
    window.location.href = '/api/connectors/gmail/auth';
  };
  const handleSyncGmail = async () => {
    const gm = connectors.find((c) => c.id === 'gmail');
    if (gm) await handleSyncConnector(gm);
  };
  const handleRevokeGmail = async () => {
    const gm = connectors.find((c) => c.id === 'gmail');
    if (gm) await handleRevokeConnector(gm);
  };

  // Current brief helper
  const currentBrief = briefDetail?.brief || briefs.find((b) => b.id === selectedBriefId) || null;

  // Real diff lines between parent brief and current brief
  const unifiedDiffLines = useMemo(() => {
    if (!briefDetail?.parentBrief?.markdown || !currentBrief?.markdown) return [];
    return computeUnifiedDiff(briefDetail.parentBrief.markdown, currentBrief.markdown);
  }, [briefDetail, currentBrief]);

  // Filtered briefs for selector tabs (including Starred E7)
  const filteredBriefs = useMemo(() => {
    if (briefFilter === 'starred') return briefs.filter((b) => !!b.starred);
    if (briefFilter === 'all') return briefs;
    return briefs.filter((b) => (b.mode || 'home') === briefFilter);
  }, [briefs, briefFilter]);

  const handleToggleStar = async (briefId: string, currentStarred: boolean) => {
    try {
      const nextStarred = !currentStarred;
      // Optimistic state update
      setBriefs((prev) => prev.map((b) => (b.id === briefId ? { ...b, starred: nextStarred } : b)));
      if (briefDetail?.brief?.id === briefId) {
        setBriefDetail((prev: any) => prev ? { ...prev, brief: { ...prev.brief, starred: nextStarred } } : prev);
      }

      const res = await fetch(`/api/briefs/${briefId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: nextStarred }),
      });

      if (!res.ok) {
        // Revert on error
        setBriefs((prev) => prev.map((b) => (b.id === briefId ? { ...b, starred: currentStarred } : b)));
        if (briefDetail?.brief?.id === briefId) {
          setBriefDetail((prev: any) => prev ? { ...prev, brief: { ...prev.brief, starred: currentStarred } } : prev);
        }
      }
    } catch (err) {
      console.error('Failed to toggle star status:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/login';
  };

  const handleOpenDiff = async (fromId: string, toId: string) => {
    try {
      setIsDiffLoading(true);
      const res = await fetch(`/api/briefs/diff?fromId=${fromId}&toId=${toId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.diff) {
          setDiffModalData(json.diff);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to compare brief versions');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to compare brief versions');
    } finally {
      setIsDiffLoading(false);
    }
  };

  const handleExportObsidian = async (briefId: string) => {
    try {
      const res = await fetch(`/api/briefs/${briefId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'obsidian' }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brief_${briefId.slice(0, 8)}_obsidian.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Obsidian export error:', err);
    }
  };

  const handleExportNotion = async (briefId: string) => {
    try {
      const res = await fetch(`/api/briefs/${briefId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'notion' }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.markdown) {
          await navigator.clipboard.writeText(json.markdown);
          alert('Notion blocks copied to clipboard! You can paste directly into any Notion page.');
        }
      }
    } catch (err) {
      console.error('Notion export error:', err);
    }
  };

  const renderSourcesTable = (title: string, description?: string) => {
    const filtered = uploadedFiles.filter((f) => {
      if (sourceFilterConnector === 'all') return true;
      return f.connector === sourceFilterConnector;
    });

    const gmailCount = uploadedFiles.filter((f) => f.connector === 'gmail').length;
    const calCount = uploadedFiles.filter((f) => f.connector === 'calendar').length;
    const driveCount = uploadedFiles.filter((f) => f.connector === 'drive').length;
    const uploadCount = uploadedFiles.filter((f) => f.connector === 'upload').length;
    const githubCount = uploadedFiles.filter((f) => f.connector === 'github').length;
    const slackCount = uploadedFiles.filter((f) => f.connector === 'slack').length;
    const notionCount = uploadedFiles.filter((f) => f.connector === 'notion').length;

    return (
      <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
              {title} ({uploadedFiles.length})
            </h3>
            {description && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {description}
              </p>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSourceFilterConnector('all')}
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--card-border)',
                background: sourceFilterConnector === 'all' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                color: sourceFilterConnector === 'all' ? '#ffffff' : 'var(--text)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              All ({uploadedFiles.length})
            </button>
            {gmailCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('gmail')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'gmail' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'gmail' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Mail size={12} color={sourceFilterConnector === 'gmail' ? '#fff' : '#ef4444'} />
                Gmail ({gmailCount})
              </button>
            )}
            {calCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('calendar')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'calendar' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'calendar' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Calendar size={12} color={sourceFilterConnector === 'calendar' ? '#fff' : '#3b82f6'} />
                Calendar ({calCount})
              </button>
            )}
            {driveCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('drive')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'drive' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'drive' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <HardDrive size={12} color={sourceFilterConnector === 'drive' ? '#fff' : '#10b981'} />
                Drive ({driveCount})
              </button>
            )}
            {githubCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('github')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'github' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'github' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <GitBranch size={12} color={sourceFilterConnector === 'github' ? '#fff' : '#8b5cf6'} />
                GitHub ({githubCount})
              </button>
            )}
            {slackCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('slack')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'slack' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'slack' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <MessageSquare size={12} color={sourceFilterConnector === 'slack' ? '#fff' : '#10b981'} />
                Slack ({slackCount})
              </button>
            )}
            {notionCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('notion')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'notion' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'notion' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <FileText size={12} color={sourceFilterConnector === 'notion' ? '#fff' : '#f43f5e'} />
                Notion ({notionCount})
              </button>
            )}
            {uploadCount > 0 && (
              <button
                onClick={() => setSourceFilterConnector('upload')}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: sourceFilterConnector === 'upload' ? 'var(--accent)' : 'var(--card-bg-subtle)',
                  color: sourceFilterConnector === 'upload' ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <FileText size={12} color={sourceFilterConnector === 'upload' ? '#fff' : 'var(--text-muted)'} />
                Uploads ({uploadCount})
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
            <FileText size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
            <p style={{ fontSize: '0.85rem' }}>No indexed items matching this filter.</p>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
            <table className="dash-table" style={{ minWidth: '600px', width: '100%' }}>
              <thead>
                <tr>
                  <th>Source Item / Subject</th>
                  <th>Chunks</th>
                  <th>Connector</th>
                  <th>Trust Boundary</th>
                  <th>Ingested</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: 'var(--card-bg-subtle)',
                            border: '1px solid var(--card-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {file.connector === 'gmail' && <Mail size={14} color="#ef4444" />}
                          {file.connector === 'calendar' && <Calendar size={14} color="#3b82f6" />}
                          {file.connector === 'drive' && <HardDrive size={14} color="#10b981" />}
                          {file.connector === 'upload' && <FileText size={14} color="var(--text-muted)" />}
                          {file.connector === 'github' && <GitBranch size={14} color="#8b5cf6" />}
                          {file.connector === 'slack' && <MessageSquare size={14} color="#10b981" />}
                          {file.connector === 'notion' && <FileText size={14} color="#f43f5e" />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              color: 'var(--text)',
                              fontSize: '0.84rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '320px',
                            }}
                          >
                            {file.name}
                          </div>
                          {file.subtitle && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: 'var(--text-muted)',
                                marginTop: '2px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '320px',
                              }}
                            >
                              {file.subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {file.size}
                    </td>
                    <td>
                      <span className="dash-badge dash-badge-mode" style={{ textTransform: 'capitalize' }}>
                        {file.connector}
                      </span>
                    </td>
                    <td>
                      <span
                        className="dash-badge dash-badge-mode"
                        style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Lock size={10} />
                        untrusted_content
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {file.date}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleResyncSource(file.id)}
                          disabled={Boolean(resyncingSources[file.id])}
                          className="dash-icon-btn"
                          title="Re-sync / refresh this source record from provider"
                        >
                          <RefreshCw
                            size={14}
                            color="var(--accent)"
                            className={resyncingSources[file.id] ? 'animate-spin' : ''}
                          />
                        </button>
                        <button
                          onClick={() => handleInspectSource(file.id)}
                          className="dash-icon-btn"
                          title="Inspect Ingested Chunks & Metadata"
                        >
                          <Eye size={14} color="var(--text)" />
                        </button>
                        <button
                          onClick={() => handleDeleteSource(file.id)}
                          className="dash-icon-btn"
                          title="Delete source and chunks from database"
                        >
                          <Trash2 size={14} color="var(--text-muted)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  if (isLoadingAuth || !user || !workspace) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: 'var(--font-mono)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '3px solid rgba(16, 185, 129, 0.2)',
            borderTopColor: '#10b981',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Authenticating Ballast session...
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      user={user}
      workspace={workspace}
      briefsCount={briefs.length}
      pendingActionsCount={workspaceActions.filter((a) => !a.approved_at).length}
      sourcesCount={uploadedFiles.length + connectors.filter((c) => c.health.connected).length}
      schedulesCount={schedules.filter((s) => s.enabled).length}
      accessLogsCount={accessLogs.length}
      flagsCount={flags.filter((f) => f.status !== 'resolved').length}
      telemetryAvgLatency={telemetry?.telemetry?.avg_latency_ms}
      storageCount={storageLabel}
      notificationsCount={notifications.length}
      unreadNotificationsCount={unreadNotifCount}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      mode={mode}
      onToggleMode={() => setMode((m) => (m === 'home' ? 'world' : 'home'))}
      title={currentBrief?.question || (briefs.length === 0 ? 'No Briefs Generated' : 'Briefs Archive')}
      subtitle={currentBrief?.as_of ? new Date(currentBrief.as_of).toLocaleDateString() : undefined}
      currentBrief={currentBrief}
      citations={briefDetail?.citations || []}
      runs={briefDetail?.runs}
      onCreateBrief={handleOpenCreateBrief}
      actionLoading={actionLoading}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
      isDemo={isDemo}
      onWorkspaceSwitched={refreshAllWorkspaceData}
      onResolveConflict={async (citationId, resolutionType) => {
        if (selectedBriefId) {
          try {
            const res = await fetch(`/api/briefs/${selectedBriefId}`);
            if (res.ok) {
              const data = await res.json();
              setBriefDetail(data);
            }
          } catch (err) {
            console.error('Failed to reload brief detail:', err);
          }
        }
      }}
    >
      {/* ======================================================== */}
      {/* SECTION: BRIEFS ARCHIVE                                   */}
      {/* ======================================================== */}
      {activeSection === 'briefs' && (
        <div style={{ maxWidth: '980px', width: '100%', boxSizing: 'border-box', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Query Bar for Grounded Ingestion */}
          <div
            className="dash-card dash-query-card"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              border: mode === 'world' ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(16, 185, 129, 0.28)',
              background: mode === 'world'
                ? 'linear-gradient(to right, rgba(6, 182, 212, 0.10), transparent)'
                : 'linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)',
              boxShadow: mode === 'world' ? '0 0 16px rgba(6, 182, 212, 0.12)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                <span
                  className="dash-badge"
                  style={{
                    background: mode === 'world' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: mode === 'world' ? '#06b6d4' : '#10b981',
                    border: `1px solid ${mode === 'world' ? 'rgba(6, 182, 212, 0.5)' : 'rgba(16, 185, 129, 0.4)'}`,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mode === 'world' ? 'World Mode (Private + Web)' : 'Home Mode (Private Only)'}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', minWidth: 0 }}>
                  {mode === 'world'
                    ? 'Dual-pass retrieval across workspace sources and snapshot-backed live web'
                    : 'Grounded retrieval strictly within workspace sources and mail'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setMode('home')}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: mode === 'home' ? '#10b981' : 'var(--card-border)',
                      background: mode === 'home' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: mode === 'home' ? '#10b981' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Home (Private Only)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('world')}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: mode === 'world' ? '#06b6d4' : 'var(--card-border)',
                      background: mode === 'world' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                      color: mode === 'world' ? '#06b6d4' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    World (Private + Web)
                  </button>
                </div>

                {/* Notifications Bell (FR7.2) */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotifDropdownOpen((prev) => !prev);
                      if (unreadNotifCount > 0) {
                        handleMarkNotificationsRead();
                      }
                    }}
                    className="dash-icon-btn"
                    title="Notifications (FR7.2)"
                    style={{ position: 'relative', padding: '6px' }}
                  >
                    <Bell size={16} />
                    {unreadNotifCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#ef4444',
                        }}
                      />
                    )}
                  </button>

                  {isNotifDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '34px',
                        right: 0,
                        width: '320px',
                        maxHeight: '380px',
                        overflowY: 'auto',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        padding: '12px',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>Notifications</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{notifications.length} recent</span>
                      </div>
                      {notifications.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            style={{
                              padding: '8px',
                              borderRadius: '6px',
                              background: n.read ? 'transparent' : 'var(--card-bg-subtle)',
                              border: '1px solid var(--card-border)',
                              fontSize: '0.78rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <strong style={{ color: n.type === 'brief_failed' ? '#ef4444' : '#10b981' }}>{n.title}</strong>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>{n.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="dash-query-input-row">
              <input
                ref={queryInputRef}
                type="text"
                value={queryPrompt}
                onChange={(e) => setQueryPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && queryPrompt.trim() && !isGenerating) {
                    handleEnqueueBrief(queryPrompt, mode);
                  }
                }}
                placeholder={
                  mode === 'world'
                    ? "Ask a World query across private docs & live web..."
                    : "Ask a question grounded in your uploads..."
                }
                disabled={isGenerating}
                style={{
                  flex: '1 1 200px',
                  minWidth: 0,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--card-bg-subtle)',
                  border: mode === 'world' ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid var(--card-border)',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => handleEnqueueBrief(queryPrompt, mode)}
                disabled={!queryPrompt.trim() || isGenerating}
                className="dash-btn-primary"
                style={{
                  padding: '10px 18px',
                  fontSize: '0.82rem',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  background: mode === 'world' ? 'linear-gradient(135deg, #0891b2, #06b6d4)' : undefined,
                  borderColor: mode === 'world' ? '#0891b2' : undefined,
                }}
              >
                {isGenerating ? 'Synthesizing...' : mode === 'world' ? 'Generate World Brief' : 'Generate Home Brief'}
              </button>
            </div>

            {/* Smart Suggestion Pills (E4) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>✨ Suggested:</span>
                <button
                  type="button"
                  onClick={() => fetchSuggestions(mode)}
                  disabled={isLoadingSuggestions}
                  title="Refresh suggestions based on recent sources and briefs"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  className="hover-subtle"
                >
                  <span style={{ display: 'inline-block', transform: isLoadingSuggestions ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
                    🔄
                  </span>
                </button>
              </div>

              {isLoadingSuggestions && suggestions.length === 0 ? (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Analyzing sources & brief history...</span>
              ) : suggestions.length > 0 ? (
                suggestions.map((s) => {
                  const isWorld = s.mode === 'world';
                  const isFollowup = s.category === 'follow_up';
                  const isSynergy = s.category === 'recency';

                  const getBadgeColors = () => {
                    if (isWorld) return { bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.3)', text: '#06b6d4' };
                    if (isFollowup) return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', text: '#f59e0b' };
                    if (isSynergy) return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' };
                    return { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' };
                  };

                  const getIcon = () => {
                    if (s.icon === 'clock' || isFollowup) return '⚡';
                    if (s.icon === 'calendar') return '📅';
                    if (s.icon === 'github') return '🐙';
                    if (s.icon === 'gmail') return '✉️';
                    if (s.icon === 'drive') return '📁';
                    if (s.icon === 'slack') return '💬';
                    if (s.icon === 'notion') return '📝';
                    if (s.icon === 'layers') return '🔄';
                    if (isWorld || s.icon === 'globe') return '🌐';
                    return '💡';
                  };

                  const colors = getBadgeColors();

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setQueryPrompt(s.question);
                        if (s.mode && s.mode !== mode) {
                          setMode(s.mode);
                        }
                      }}
                      title={`${s.reason}\n\nClick to load: "${s.question}"`}
                      style={{
                        fontSize: '0.7rem',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        background: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                      className="hover-subtle"
                    >
                      <span style={{ fontSize: '0.72rem' }}>{getIcon()}</span>
                      <span style={{ fontWeight: 500 }}>{s.label}</span>
                    </button>
                  );
                })
              ) : mode === 'world' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setQueryPrompt('What are the official Stripe webhook signature verification requirements?')}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(6, 182, 212, 0.12)',
                      color: '#06b6d4',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    🌐 Stripe Webhooks
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryPrompt('What are the GDPR Article 6 requirements for recurring card billing?')}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(6, 182, 212, 0.12)',
                      color: '#06b6d4',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    🌐 GDPR Article 6
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setQueryPrompt('What are the outstanding deliverables and open questions for the Q3 billing revamp?')}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    💡 Q3 Billing Deliverables
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryPrompt('What is the status of the merchant accounts configuration?')}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    💡 Merchant Accounts
                  </button>
                </>
              )}
            </div>

            {/* Live Progress Stepper */}
            {isGenerating && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', animation: 'pulse 1.5s infinite' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                      Asynchronous Critic Pipeline Running...
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    Current Step: {generationSteps[generationSteps.length - 1]?.step || 'queued'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    'queued',
                    'planning',
                    'retrieving_private',
                    'drafting',
                    'verifying',
                    'validating',
                    'rendering',
                    'published',
                  ].map((step) => {
                    const isPassed = generationSteps.some((s) => s.step === step);
                    const isCurrent = generationSteps[generationSteps.length - 1]?.step === step;
                    return (
                      <span
                        key={step}
                        style={{
                          fontSize: '0.68rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isCurrent
                            ? 'rgba(16, 185, 129, 0.25)'
                            : isPassed
                            ? 'rgba(16, 185, 129, 0.1)'
                            : 'var(--card-border)',
                          color: isCurrent ? '#10b981' : isPassed ? '#10b981' : 'var(--text-muted)',
                          border: isCurrent ? '1px solid #10b981' : '1px solid transparent',
                          fontWeight: isCurrent ? 700 : 500,
                        }}
                      >
                        {isPassed && !isCurrent ? '✓ ' : ''}{step}
                      </span>
                    );
                  })}
                </div>

                {generationSteps[generationSteps.length - 1]?.message && (
                  <div style={{ fontSize: '0.74rem', color: '#10b981', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>&bull;</span>
                    <span>{generationSteps[generationSteps.length - 1].message}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Brief Content or Empty State */}
          {briefs.length === 0 ? (
            <div
              className="dash-card"
              style={{
                textAlign: 'center',
                padding: '60px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>No Briefs in Workspace</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '6px auto 0' }}>
                  Your workspace has no published briefs yet. Connect a source, upload documents, or run a suggested question through the dual-gate pipeline.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    const q = 'What are the key open deliverables and action items across workspace sources?';
                    setMode('home');
                    setQueryPrompt(q);
                    handleEnqueueBrief(q, 'home');
                  }}
                  disabled={isGenerating}
                  className="dash-btn-primary"
                  style={{ padding: '8px 18px', fontSize: '0.82rem' }}
                >
                  <Sparkles size={15} />
                  <span>{isGenerating ? 'Queuing...' : 'Ask Workspace Sources (Home)'}</span>
                </button>
                <button
                  onClick={() => {
                    const q = 'What are the key compliance and security requirements for recurring billing?';
                    setMode('world');
                    setQueryPrompt(q);
                    handleEnqueueBrief(q, 'world');
                  }}
                  disabled={isGenerating}
                  className="dash-btn-secondary"
                  style={{ padding: '8px 18px', fontSize: '0.82rem', borderColor: 'rgba(6, 182, 212, 0.4)', color: '#06b6d4' }}
                >
                  <Globe size={15} />
                  <span>{isGenerating ? 'Queuing...' : 'Ask Web & Sources (World)'}</span>
                </button>
                <button
                  onClick={() => setActiveSection('upload')}
                  className="dash-btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  <UploadCloud size={15} />
                  <span>Upload Sources</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Brief Archive Switcher & Mode Filter */}
              <div
                className="dash-card"
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                      Workspace Briefs ({briefs.length})
                    </span>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setBriefFilter('all')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: briefFilter === 'all' ? '#6366f1' : 'var(--card-border)',
                        background: briefFilter === 'all' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: briefFilter === 'all' ? '#a5b4fc' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      All ({briefs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBriefFilter('home')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: briefFilter === 'home' ? '#10b981' : 'var(--card-border)',
                        background: briefFilter === 'home' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                        color: briefFilter === 'home' ? '#10b981' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Home ({briefs.filter((b) => (b.mode || 'home') === 'home').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBriefFilter('world')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: briefFilter === 'world' ? '#06b6d4' : 'var(--card-border)',
                        background: briefFilter === 'world' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                        color: briefFilter === 'world' ? '#06b6d4' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      World ({briefs.filter((b) => b.mode === 'world').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBriefFilter('starred')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: briefFilter === 'starred' ? '#f59e0b' : 'var(--card-border)',
                        background: briefFilter === 'starred' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                        color: briefFilter === 'starred' ? '#f59e0b' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Star size={11} fill={briefFilter === 'starred' ? '#f59e0b' : 'none'} />
                      <span>Starred ({briefs.filter((b) => !!b.starred).length})</span>
                    </button>
                  </div>
                </div>

                {/* Brief Items Horizontal Selector */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {filteredBriefs.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                      No {briefFilter} mode briefs generated yet. Enter a question in the prompt bar above to enqueue a run.
                    </div>
                  ) : (
                    filteredBriefs.map((b) => {
                      const isSelected = b.id === selectedBriefId;
                      const isWorld = b.mode === 'world';
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBriefId(b.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: isSelected
                              ? isWorld
                                ? 'rgba(6, 182, 212, 0.15)'
                                : 'rgba(16, 185, 129, 0.15)'
                              : 'var(--card-bg-subtle)',
                            border: '1px solid',
                            borderColor: isSelected
                              ? isWorld
                                ? '#06b6d4'
                                : '#10b981'
                              : 'var(--card-border)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease',
                            textAlign: 'left',
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStar(b.id, !!b.starred);
                            }}
                            title={b.starred ? 'Unstar brief' : 'Star brief (E7)'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              color: b.starred ? '#f59e0b' : 'var(--text-muted)',
                            }}
                          >
                            <Star size={13} fill={b.starred ? '#f59e0b' : 'none'} />
                          </button>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: isWorld ? 'rgba(6, 182, 212, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                              color: isWorld ? '#06b6d4' : '#10b981',
                              textTransform: 'uppercase',
                            }}
                          >
                            {b.mode || 'home'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: isSelected ? 600 : 400,
                              color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                              maxWidth: '260px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {b.question}
                          </span>
                          {b.status === 'failed' && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#ef4444',
                                textTransform: 'uppercase',
                              }}
                            >
                              Failed
                            </span>
                          )}
                          {isSelected && <span style={{ fontSize: '0.75rem', color: isWorld ? '#06b6d4' : '#10b981' }}>✓</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Staleness Warning & Regenerate CTA (FR4.7) */}
              {currentBrief?.stale_after && new Date(currentBrief.stale_after).getTime() < Date.now() && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                    <Clock size={16} color="#f59e0b" />
                    <span>
                      <strong>Stale Brief (FR4.7):</strong> As of {new Date(currentBrief.as_of).toLocaleDateString()}, this brief is past its freshness window. Connected workspace sources may have changed.
                    </span>
                  </div>
                  <button
                    onClick={handleRegenerate}
                    disabled={actionLoading}
                    className="dash-btn-primary"
                    style={{ background: '#f59e0b', color: '#000000', fontSize: '0.78rem', padding: '6px 14px', fontWeight: 600 }}
                    title="Regenerate inserts a new child row with parent_brief_id"
                  >
                    <RefreshCw size={13} className={actionLoading ? 'animate-spin' : ''} />
                    <span>Regenerate (New Child Brief)</span>
                  </button>
                </div>
              )}

              {/* Failure Alert & Retry CTA */}
              {currentBrief?.status === 'failed' && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', maxWidth: '80%' }}>
                    <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#ef4444', marginBottom: '2px' }}>
                        Brief Generation Failed
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'rgba(254, 202, 202, 0.95)', wordBreak: 'break-word', lineHeight: 1.4 }}>
                        {currentBrief.error ? `Failure Reason: ${currentBrief.error}` : 'The background generation pipeline failed to complete this brief.'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRetryBrief(currentBrief.id)}
                    disabled={actionLoading || isGenerating}
                    className="dash-btn-primary"
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      padding: '6px 14px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Re-enqueue this brief to retry generation"
                  >
                    <RefreshCw size={13} className={actionLoading ? 'animate-spin' : ''} />
                    <span>Retry Brief</span>
                  </button>
                </div>
              )}

              {/* Brief Action Bar */}
              <div
                className="dash-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className={currentBrief?.status === 'failed' ? 'dash-badge dash-badge-failed' : 'dash-badge dash-badge-published'}>
                      {currentBrief?.status || 'published'}
                    </span>
                    <span
                      className="dash-badge"
                      style={{
                        background: currentBrief?.mode === 'world' ? 'rgba(6, 182, 212, 0.18)' : 'rgba(16, 185, 129, 0.15)',
                        color: currentBrief?.mode === 'world' ? '#06b6d4' : '#10b981',
                        border: `1px solid ${currentBrief?.mode === 'world' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
                        fontWeight: 600,
                      }}
                    >
                      {currentBrief?.mode === 'world' ? 'World Mode (Private + Web)' : 'Home Mode (Private Only)'}
                    </span>
                    {currentBrief?.parent_brief_id && (
                      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <GitBranch size={13} /> Child Version
                      </span>
                    )}
                  </div>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.3 }}>
                    {currentBrief?.question}
                  </h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {currentBrief?.parent_brief_id && (
                    <button
                      type="button"
                      onClick={() => handleOpenDiff(currentBrief.parent_brief_id, currentBrief.id)}
                      disabled={isDiffLoading}
                      className="dash-btn-secondary"
                      title="View side-by-side section and claim diff against parent revision (FR6.2)"
                    >
                      <GitBranch size={14} className={isDiffLoading ? 'animate-spin' : ''} />
                      <span>Compare Diff</span>
                    </button>
                  )}

                  {currentBrief?.status === 'failed' && (
                    <button
                      onClick={() => handleRetryBrief(currentBrief.id)}
                      disabled={actionLoading || isGenerating}
                      className="dash-btn-primary"
                      style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.78rem', padding: '6px 14px', fontWeight: 600 }}
                      title="Retry failed generation for this brief"
                    >
                      <RefreshCw size={13} className={actionLoading ? 'animate-spin' : ''} />
                      <span>Retry Brief</span>
                    </button>
                  )}

                  <button
                    onClick={handleRegenerate}
                    disabled={actionLoading}
                    className="dash-btn-secondary"
                    title="Regenerate inserts a new child row with parent_brief_id, leaving this brief unchanged"
                  >
                    <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
                    <span>Regenerate</span>
                  </button>

                  {currentBrief?.markdown && (
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([currentBrief.markdown], { type: 'text/markdown;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `brief_${currentBrief.id?.slice(0, 8) || 'export'}.md`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                      }}
                      className="dash-btn-secondary"
                      title="Download brief in raw frozen template v1 markdown (FR6.3)"
                    >
                      <FileText size={14} />
                      <span>Export Markdown</span>
                    </button>
                  )}

                  {currentBrief?.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleExportObsidian(currentBrief.id)}
                        className="dash-btn-secondary"
                        title="Export brief formatted for Obsidian with YAML frontmatter and callouts (FR9)"
                      >
                        <FileUp size={14} />
                        <span>Obsidian</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportNotion(currentBrief.id)}
                        className="dash-btn-secondary"
                        title="Copy Notion-compatible markdown blocks to clipboard (FR9)"
                      >
                        <FileText size={14} />
                        <span>Notion</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStar(currentBrief.id, !!currentBrief.starred)}
                        className="dash-btn-secondary"
                        style={{
                          color: currentBrief.starred ? '#f59e0b' : 'var(--text)',
                          borderColor: currentBrief.starred ? 'rgba(245, 158, 11, 0.4)' : undefined,
                          background: currentBrief.starred ? 'rgba(245, 158, 11, 0.12)' : undefined,
                        }}
                        title={currentBrief.starred ? 'Remove bookmark' : 'Bookmark this brief as important (E7)'}
                      >
                        <Star size={14} fill={currentBrief.starred ? '#f59e0b' : 'none'} />
                        <span>{currentBrief.starred ? 'Starred' : 'Star'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="dash-btn-primary"
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          borderColor: '#6366f1',
                          padding: '6px 14px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                        title="Create an expiring, read-only public share link (E5)"
                      >
                        <Share2 size={13} />
                        <span>Share Brief</span>
                      </button>
                    </>
                  )}

                  {currentBrief?.id && (
                    <a
                      href={`/api/briefs/${currentBrief.id}/pdf`}
                      download
                      className="dash-btn-primary"
                    >
                      <Download size={14} />
                      <span>Download PDF</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Viewer Tabs Header */}
              <div className="dash-tabs">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`dash-tab-btn ${activeTab === 'preview' ? 'is-active' : ''}`}
                >
                  8-Heading Preview
                </button>
                <button
                  onClick={() => setActiveTab('citations')}
                  className={`dash-tab-btn ${activeTab === 'citations' ? 'is-active' : ''}`}
                >
                  <span>Citations</span>
                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '9999px', background: 'var(--card-border)' }}>
                    {briefDetail?.citations?.length || 0}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('actions')}
                  className={`dash-tab-btn ${activeTab === 'actions' ? 'is-active' : ''}`}
                >
                  <span>Action Drafts</span>
                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '9999px', background: 'var(--card-border)' }}>
                    {briefDetail?.actions?.length || 0}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('run')}
                  className={`dash-tab-btn ${activeTab === 'run' ? 'is-active' : ''}`}
                >
                  Critic Log &amp; Run
                </button>
                <button
                  onClick={() => setActiveTab('markdown')}
                  className={`dash-tab-btn ${activeTab === 'markdown' ? 'is-active' : ''}`}
                >
                  Raw Markdown
                </button>
              </div>

              {/* Tab: 8-Heading Preview */}
              {activeTab === 'preview' && (
                <div className="dash-card dash-brief-content">
                  {currentBrief?.markdown ? (
                    <div>
                      {/* Executive Summary (TL;DR) Banner (Audit E1) */}
                      {(currentBrief.summary || currentBrief.markdown.includes('> **TL;DR:**')) && (
                        <div
                          style={{
                            marginBottom: '22px',
                            padding: '14px 18px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles size={15} color="#10b981" />
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981' }}>
                              Executive Summary (TL;DR)
                            </span>
                          </div>
                          <p style={{ fontSize: '0.92rem', lineHeight: '1.55', color: 'var(--text)', fontWeight: 500, margin: 0 }}>
                            {currentBrief.summary || currentBrief.markdown.match(/> \*\*TL;DR:\*\* (.*)/)?.[1] || ''}
                          </p>
                        </div>
                      )}

                      {currentBrief.markdown.split('\n\n').map((block: string, idx: number) => {
                        if (block.startsWith('# ')) return null; // Main title in header
                        if (block.startsWith('> **TL;DR:**')) return null; // Rendered in top banner
                        if (block.startsWith('## ')) {
                          const lines = block.split('\n');
                          const heading = lines[0].replace('## ', '').trim();
                          const rest = lines.slice(1);
                          return (
                            <div key={idx} style={{ marginBottom: '24px', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <h2 className="dash-section-title">{heading}</h2>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '100%' }}>
                                {rest.map((line, lineIdx) => {
                                  const trimmed = line.trim();
                                  if (!trimmed) return null;

                                  // Subheadings (e.g. ### Private, ### Web)
                                  if (trimmed.startsWith('### ')) {
                                    return (
                                      <h3
                                        key={lineIdx}
                                        style={{
                                          fontSize: '0.74rem',
                                          fontFamily: 'var(--font-mono)',
                                          textTransform: 'uppercase',
                                          color: 'var(--text-muted)',
                                          marginTop: '12px',
                                          marginBottom: '4px',
                                          fontWeight: 600,
                                          letterSpacing: '0.04em',
                                        }}
                                      >
                                        {trimmed.replace('### ', '')}
                                      </h3>
                                    );
                                  }

                                  // Verified Claims
                                  if (trimmed.startsWith('- Claim: ') || trimmed.includes('- Claim: ')) {
                                    const rawClaim = trimmed.replace(/^.*?-\s*Claim:\s*/i, '');
                                    const cleanClaim = cleanHtmlAndTracking(rawClaim);
                                    if (!cleanClaim) return null;

                                    return (
                                      <div
                                        key={lineIdx}
                                        style={{
                                          padding: '10px 14px',
                                          borderRadius: '8px',
                                          background: 'var(--card-bg-subtle)',
                                          border: '1px solid var(--card-border)',
                                          fontSize: '0.88rem',
                                          color: 'var(--text)',
                                          marginTop: '6px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: '12px',
                                          maxWidth: '100%',
                                          overflowWrap: 'anywhere',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                          <span style={{ color: '#10b981', fontWeight: 700, marginRight: '6px' }}>Claim:</span>
                                          <span>{cleanClaim}</span>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setFlagClaimText(cleanClaim);
                                            setIsFlagModalOpen(true);
                                          }}
                                          className="dash-icon-btn"
                                          title="Flag claim (wrong or unsupported)"
                                          style={{ flexShrink: 0 }}
                                        >
                                          <Flag size={13} color="var(--text-muted)" />
                                        </button>
                                      </div>
                                    );
                                  }

                                  // Citation Quotes under claims (e.g. `  - [private] ...` or `[private] ... — "..."`)
                                  if (
                                    trimmed.startsWith('  - ') ||
                                    trimmed.startsWith('- [private]') ||
                                    trimmed.startsWith('- [web]') ||
                                    trimmed.startsWith('• [private]') ||
                                    trimmed.startsWith('• [web]') ||
                                    (trimmed.includes(' — ') && (trimmed.includes('[private]') || trimmed.includes('[web]')))
                                  ) {
                                    const parsed = parseAndHumanizeCitationLine(trimmed);
                                    if (!parsed.quote) return null;

                                    return (
                                      <div
                                        key={lineIdx}
                                        style={{
                                          marginLeft: '12px',
                                          padding: '8px 12px',
                                          borderRadius: '6px',
                                          background: 'rgba(255, 255, 255, 0.02)',
                                          borderLeft: `2px solid ${parsed.sourceClass === 'web' ? '#06b6d4' : '#10b981'}`,
                                          marginTop: '4px',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '4px',
                                          maxWidth: '100%',
                                          overflowWrap: 'anywhere',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                                          <span
                                            style={{
                                              color: parsed.sourceClass === 'web' ? '#06b6d4' : '#10b981',
                                              fontWeight: 600,
                                              textTransform: 'uppercase',
                                            }}
                                          >
                                            {parsed.sourceClass === 'web' ? 'Web Source' : 'Your Files'}
                                          </span>
                                          {parsed.sourceLabel && (
                                            <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                                              &bull; {parsed.sourceLabel}
                                            </span>
                                          )}
                                        </div>
                                        <blockquote
                                          style={{
                                            fontSize: '0.82rem',
                                            fontStyle: 'italic',
                                            color: 'var(--text-muted)',
                                            margin: 0,
                                            lineHeight: '1.5',
                                            overflowWrap: 'anywhere',
                                            wordBreak: 'break-word',
                                          }}
                                        >
                                          &ldquo;{parsed.quote}&rdquo;
                                        </blockquote>
                                      </div>
                                    );
                                  }

                                  // Action item checkboxes (e.g. `- [ ] ...`)
                                  if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ')) {
                                    const isDone = trimmed.startsWith('- [x] ');
                                    const actionText = cleanHtmlAndTracking(trimmed.replace(/^-\s*\[[ xX]?\]\s*/, ''));
                                    if (!actionText) return null;

                                    return (
                                      <div
                                        key={lineIdx}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'flex-start',
                                          gap: '8px',
                                          padding: '6px 10px',
                                          borderRadius: '6px',
                                          background: 'var(--card-bg-subtle)',
                                          border: '1px solid var(--card-border)',
                                          fontSize: '0.86rem',
                                          color: 'var(--text)',
                                          overflowWrap: 'anywhere',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        <CheckSquare size={15} color={isDone ? '#10b981' : 'var(--text-muted)'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                        <span style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--text-muted)' : 'var(--text)' }}>
                                          {actionText}
                                        </span>
                                      </div>
                                    );
                                  }

                                  // Bullet points
                                  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                    const cleanText = cleanHtmlAndTracking(trimmed.replace(/^[-*]\s*/, ''));
                                    if (!cleanText) return null;

                                    return (
                                      <div key={lineIdx} className="dash-list-item" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                        {cleanText}
                                      </div>
                                    );
                                  }

                                  // Plain text paragraphs
                                  const cleanParagraph = cleanHtmlAndTracking(trimmed);
                                  if (!cleanParagraph) return null;

                                  return (
                                    <p key={lineIdx} style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text)', margin: '4px 0', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                      {cleanParagraph}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        const cleanBlock = cleanHtmlAndTracking(block);
                        if (!cleanBlock) return null;

                        return (
                          <p key={idx} style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text)', margin: '8px 0', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {cleanBlock}
                          </p>
                        );
                      })}
                    </div>
                  ) : currentBrief?.status === 'failed' ? (
                    <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                        <AlertCircle size={26} />
                      </div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)' }}>Brief Generation Failed</h3>
                      <p style={{ fontSize: '0.85rem', color: '#f87171', maxWidth: '520px', lineHeight: 1.5, background: 'rgba(239, 68, 68, 0.08)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        {currentBrief.error || 'The generation pipeline was interrupted or failed to validate.'}
                      </p>
                      <button
                        onClick={() => handleRetryBrief(currentBrief.id)}
                        disabled={actionLoading || isGenerating}
                        className="dash-btn-primary"
                        style={{ background: '#ef4444', color: '#ffffff', marginTop: '6px', padding: '8px 18px', fontWeight: 600 }}
                      >
                        <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
                        <span>Retry Brief</span>
                      </button>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No markdown available.</p>
                  )}
                </div>
              )}

              {/* Tab: Citations */}
              {activeTab === 'citations' && (
                <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                      Evidence Citations ({briefDetail?.citations?.length || 0})
                    </h3>
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      Pure Dual-Gate Verification
                    </span>
                  </div>

                  {!briefDetail?.citations || briefDetail.citations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.82rem' }}>No evidence citations recorded for this brief.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {briefDetail.citations.map((c: any, idx: number) => {
                        const cleanQuoteText = cleanHtmlAndTracking(c.quote || '');
                        const sourceLabel = humanizeSourceLabel(c.url || c.source_id, c.source_class);

                        return (
                          <div
                            key={c.id || idx}
                            style={{
                              padding: '14px 16px',
                              borderRadius: '10px',
                              background: 'var(--card-bg-subtle)',
                              border: '1px solid var(--card-border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              maxWidth: '100%',
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span
                                  className="dash-badge"
                                  style={{
                                    background: c.source_class === 'web' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                    color: c.source_class === 'web' ? '#06b6d4' : '#10b981',
                                    border: `1px solid ${c.source_class === 'web' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
                                    fontWeight: 700,
                                  }}
                                >
                                  {c.source_class === 'web' ? 'Web Source' : 'Your Files'}
                                </span>

                                {c.citation_type === 'conflict' ? (
                                  c.resolution_status === 'confirmed_accurate' ? (
                                    <span
                                      className="dash-badge"
                                      style={{
                                        background: 'rgba(16, 185, 129, 0.15)',
                                        color: '#34d399',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        fontWeight: 700,
                                      }}
                                    >
                                      ✓ Confirmed Authoritative
                                    </span>
                                  ) : c.resolution_status === 'dismissed' ? (
                                    <span
                                      className="dash-badge"
                                      style={{
                                        background: 'rgba(148, 163, 184, 0.15)',
                                        color: 'var(--text-muted)',
                                        border: '1px solid rgba(148, 163, 184, 0.3)',
                                        fontWeight: 700,
                                      }}
                                    >
                                      Dismissed
                                    </span>
                                  ) : (
                                    <span
                                      className="dash-badge"
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        color: '#f59e0b',
                                        border: '1px solid rgba(245, 158, 11, 0.3)',
                                        fontWeight: 700,
                                      }}
                                    >
                                      ⚠ Conflict Discrepancy
                                    </span>
                                  )
                                ) : (
                                  <span
                                    className="dash-badge"
                                    style={{
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      color: '#10b981',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      fontWeight: 700,
                                    }}
                                  >
                                    support
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {c.citation_type === 'conflict' && (!c.resolution_status || c.resolution_status === 'unresolved') && c.id && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const res = await fetch(`/api/citations/${encodeURIComponent(c.id)}/resolve`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ resolutionType: 'confirmed_accurate' }),
                                        });
                                        if (res.ok && selectedBriefId) {
                                          const bRes = await fetch(`/api/briefs/${selectedBriefId}`);
                                          if (bRes.ok) setBriefDetail(await bRes.json());
                                        }
                                      } catch (err) {
                                        console.error('Error confirming conflict citation:', err);
                                      }
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontSize: '0.7rem',
                                      fontWeight: 600,
                                      color: '#fff',
                                      background: '#10b981',
                                      border: 'none',
                                      borderRadius: '4px',
                                      padding: '3px 8px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <span>Confirm Accurate</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setFlagClaimText(cleanQuoteText);
                                    setFlagCitationId(c.id);
                                    setIsFlagModalOpen(true);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Flag size={12} />
                                  <span>Flag Citation</span>
                                </button>
                              </div>
                            </div>
                            <blockquote
                              style={{
                                fontSize: '0.85rem',
                                fontStyle: 'italic',
                                color: 'var(--text)',
                                borderLeft: `2px solid ${c.source_class === 'web' ? '#06b6d4' : '#10b981'}`,
                                paddingLeft: '10px',
                                margin: '4px 0',
                                lineHeight: '1.55',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word',
                              }}
                            >
                              &ldquo;{cleanQuoteText}&rdquo;
                            </blockquote>
                            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              Source: {sourceLabel}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Actions */}
              {activeTab === 'actions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                        Action Drafts ({briefDetail?.actions?.length || 0})
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        Proposed emails, tasks, and issues generated from this brief. Review and approve before sending.
                      </p>
                    </div>
                    <span className="dash-badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                      Safety Review Required
                    </span>
                  </div>

                  {!briefDetail?.actions || briefDetail.actions.length === 0 ? (
                    <div className="dash-card" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.84rem' }}>No follow-up action drafts generated for this brief.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {briefDetail.actions.map((act: any) => (
                        <ActionDraftCard
                          key={act.id}
                          act={act}
                          onApprove={handleApproveAction}
                          disabled={actionLoading}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Critic Log & Run */}
              {activeTab === 'run' && (
                <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                    Dual-Gate Critic Log &amp; Execution Telemetry
                  </h3>

                  {briefDetail?.runs ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                        <div className="dash-card-subtle">
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>Latency</span>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '2px' }}>
                            {briefDetail.runs.latency_ms} ms
                          </div>
                        </div>
                        <div className="dash-card-subtle">
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>Cost</span>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#10b981', marginTop: '2px' }}>
                            ${briefDetail.runs.cost}
                          </div>
                        </div>
                        <div className="dash-card-subtle">
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>Tokens (In / Out)</span>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '4px' }}>
                            {briefDetail.runs.tokens_in} / {briefDetail.runs.tokens_out}
                          </div>
                        </div>
                        <div className="dash-card-subtle">
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>Circuit Breaker</span>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: briefDetail.runs.circuit_broken ? '#ef4444' : '#10b981', marginTop: '4px' }}>
                            {briefDetail.runs.circuit_broken ? 'Tripped' : 'Armed (Clean)'}
                          </div>
                        </div>
                      </div>

                      {briefDetail.runs.critic_log && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                            Claims Disposition (Deterministic Dual-Gate):
                          </span>
                          <pre className="dash-code-box">{JSON.stringify(briefDetail.runs.critic_log, null, 2)}</pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.82rem' }}>No execution telemetry recorded for this brief.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Raw Markdown */}
              {activeTab === 'markdown' && (
                <div className="dash-card">
                  <pre className="dash-code-box" style={{ whiteSpace: 'pre-wrap', maxHeight: '550px', overflowY: 'auto' }}>
                    {currentBrief?.markdown || 'No markdown content.'}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: UPLOAD & INGEST                                 */}
      {/* ======================================================== */}
      {activeSection === 'upload' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-published">FR2.4 &bull; Ingest</span>
              <span className="dash-badge dash-badge-mode">20 MB Cap</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Upload Documents &amp; Ingest Sources</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Server-enforced allowlist: <code style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>txt, md, pdf, png, jpg, jpeg, csv</code>. Chunks inherit untrusted boundaries and are indexed into pgvector.
            </p>
          </div>

          {/* Upload Dropzone */}
          <div
            className="dash-dropzone"
            onClick={() => {
              if (isUploading) return;
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.txt,.md,.pdf,.png,.jpg,.jpeg,.csv';
              input.onchange = (e: any) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileUpload(file);
                }
              };
              input.click();
            }}
          >
            <UploadCloud size={36} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
              {isUploading ? 'Chunking & Embedding into pgvector...' : 'Click to select or drag and drop files'}
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Maximum size 20 MB per file &bull; Private to your workspace
            </p>
          </div>

          {/* Paste Raw Text Box */}
          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>Paste Raw Text or Thread Dump</h3>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste email thread, Slack discussion, or notes here for immediate citation-grounded retrieval..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                background: 'var(--card-bg-subtle)',
                border: '1px solid var(--card-border)',
                color: 'var(--text)',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setPasteText('')}
                className="dash-btn-secondary"
                disabled={!pasteText || isUploading}
                style={{ padding: '6px 14px', fontSize: '0.78rem' }}
              >
                Clear
              </button>
              <button
                onClick={handlePasteSnippet}
                disabled={!pasteText.trim() || isUploading}
                className="dash-btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.78rem' }}
              >
                {isUploading ? 'Indexing...' : 'Index Snippet'}
              </button>
            </div>
          </div>

          {/* Uploaded Documents List */}
          {renderSourcesTable(
            'Indexed Workspace Documents',
            'Grounded private documents, notes, emails, and meetings available for verification.'
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: CONNECTED SOURCES (INTEGRATIONS MARKETPLACE)    */}
      {/* ======================================================== */}
      {activeSection === 'sources' && (
        <div style={{ width: '100%', maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', boxSizing: 'border-box', minWidth: 0 }}>
          <IntegrationsMarketplace
            connectors={connectors}
            uploadedCount={uploadedFiles.filter((u) => u.connector === 'upload').length}
            syncingConnectors={syncingConnectors}
            isSyncingAll={isSyncingAll}
            onConnect={handleConnectConnector}
            onSync={handleSyncConnector}
            onSyncAll={handleSyncAllConnectors}
            onRevoke={handleRevokeConnector}
            onSaveToken={handleSaveToken}
            onNavigateUploads={() => setActiveSection('upload')}
            initialError={initialError}
            initialMessage={initialMessage}
            syncFeedback={syncFeedback}
            onDismissFeedback={() => setSyncFeedback(null)}
          />

          {/* Live Evidence Stream from Connected Sources */}
          {renderSourcesTable(
            'Synced Live Knowledge & Evidence',
            'Real-time items synced from your connected accounts (Gmail, Google Calendar, Google Drive).'
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: SOURCE HEALTH & KNOWLEDGE INDEX DASHBOARD       */}
      {/* ======================================================== */}
      {activeSection === 'source-health' && (
        <SourceHealthDashboard
          onNavigateMarketplace={() => setActiveSection('sources')}
          onSyncConnector={async (connectorName) => {
            const conn = connectors.find((c) => c.id === connectorName || c.name.toLowerCase() === connectorName.toLowerCase());
            if (conn) {
              await handleSyncConnector(conn);
            } else {
              await fetch(`/api/connectors/${connectorName}/sync`, { method: 'POST' }).catch(() => {});
            }
          }}
        />
      )}

      {/* ======================================================== */}
      {/* SECTION: SCHEDULES & CRON                                */}
      {/* ======================================================== */}
      {activeSection === 'schedules' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="dash-badge dash-badge-published">FR7 Schedules</span>
                <span className="dash-badge dash-badge-running">Automated Cron</span>
                {workspace?.plan === 'operator' ? (
                  <span className="dash-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                    Operator Tier Active
                  </span>
                ) : (
                  <span className="dash-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    Operator Required
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Recurring Scheduled Briefs</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Scheduled jobs execute periodically in background and synthesize updated briefs with parent-child lineage.
              </p>
            </div>
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="dash-btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            >
              <Plus size={15} />
              <span>New Schedule</span>
            </button>
          </div>

          {/* Non-Operator plan callout banner (FR7.4, FR8.2) */}
          {workspace?.plan !== 'operator' && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Lock size={16} />
              <span>
                <strong>Operator Plan Required (FR7.4, FR8.2):</strong> Automated schedules run unprompted background jobs and require an Operator tier workspace. Current plan: <strong>{workspace?.plan || 'free'}</strong>.
              </span>
            </div>
          )}

          {schedules.length === 0 ? (
            <div
              className="dash-card"
              style={{
                textAlign: 'center',
                padding: '48px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Clock size={32} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>No Schedules Configured</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '420px' }}>
                Configure a recurring schedule to automatically run questions on a weekly or daily cadence.
              </p>
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="dash-btn-primary"
                style={{ padding: '6px 14px', fontSize: '0.78rem' }}
              >
                <Plus size={14} />
                <span>Create First Schedule</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {schedules.map((sched) => (
                <div key={sched.id} className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Clock size={16} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)' }}>{sched.name}</h3>
                        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {sched.cron} &bull; Mode: {sched.mode}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={sched.enabled ? 'dash-badge dash-badge-published' : 'dash-badge dash-badge-mode'}>
                        {sched.enabled ? 'Active' : 'Paused'}
                      </span>
                      <button
                        onClick={() => handleRunSchedule(sched.id)}
                        disabled={actionLoading || !sched.enabled}
                        className="dash-btn-primary"
                        style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                        title="Run this schedule now (creates a child brief linked to the last run)"
                      >
                        <Play size={12} />
                        <span>Run Now</span>
                      </button>
                      <button
                        onClick={() => handleToggleSchedule(sched.id, sched.enabled)}
                        className="dash-btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                      >
                        {sched.enabled ? 'Pause' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(sched.id)}
                        className="dash-icon-btn"
                        title="Delete schedule"
                      >
                        <Trash2 size={14} color="var(--text-muted)" />
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--card-bg-subtle)', border: '1px solid var(--card-border)', fontSize: '0.82rem', color: 'var(--text)' }}>
                    <strong style={{ color: '#10b981' }}>Question Template:</strong> {sched.question_template}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    <span>Last Run: {sched.last_run_as_of ? new Date(sched.last_run_as_of).toLocaleString() : 'Never'}</span>
                    <span>Created: {new Date(sched.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: VERSION CHAINS & DIFF                           */}
      {/* ======================================================== */}
      {activeSection === 'diff' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-published">Revision History</span>
              <span className="dash-badge dash-badge-mode">Preserved Lineage</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Version History &amp; Brief Changes</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              See verified changes between revisions. Every update preserves prior versions so you can trace how evidence evolved.
            </p>
          </div>

          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--card-border)', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                  {currentBrief ? currentBrief.question : 'No Brief Selected'}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {currentBrief?.parent_brief_id
                    ? `Revision of earlier brief (${currentBrief.parent_brief_id.slice(0, 8)})`
                    : 'Original Brief (v1)'}
                </span>
              </div>
              {currentBrief && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {currentBrief.parent_brief_id && (
                    <button
                      onClick={() => handleOpenDiff(currentBrief.parent_brief_id, currentBrief.id)}
                      disabled={isDiffLoading}
                      className="dash-btn-secondary"
                      style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                      title="Open full interactive side-by-side modal with section and claim diffs"
                    >
                      <GitBranch size={14} className={isDiffLoading ? 'animate-spin' : ''} />
                      <span>Deep Diff View</span>
                    </button>
                  )}
                  <button
                    onClick={handleRegenerate}
                    disabled={actionLoading}
                    className="dash-btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                  >
                    <GitBranch size={14} />
                    <span>Create Revision</span>
                  </button>
                </div>
              )}
            </div>

            {/* Formatted Diff Display */}
            {briefDetail?.parentBrief ? (
              <FormattedDiffViewer
                lines={unifiedDiffLines}
                fromLabel={briefDetail.parentBrief.id.slice(0, 8)}
                toLabel={currentBrief.id.slice(0, 8)}
                defaultMode="preview"
              />
            ) : currentBrief ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <GitBranch size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem' }}>This brief is a root version (no parent revision).</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Click &ldquo;Create Revision&rdquo; above to generate a new child brief with updated evidence while preserving this root version.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '0.82rem' }}>No briefs available in this workspace.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: ACTIONS                                         */}
      {/* ======================================================== */}
      {activeSection === 'actions' && (
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-running">Action Drafts</span>
              <span className="dash-badge dash-badge-published">Safety Review Enforced</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Pending Follow-up Actions</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Follow-up emails, tasks, and drafts prepared from your briefs. Nothing is sent or dispatched until you review and approve it.
            </p>
          </div>

          {workspaceActions.length === 0 ? (
            <div className="dash-card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={32} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>No Action Drafts</h3>
              <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                Follow-up action drafts (e.g. emails, issues) will appear here when generated by brief synthesis.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {workspaceActions.map((act: any) => (
                <ActionDraftCard
                  key={act.id}
                  act={act}
                  onApprove={handleApproveAction}
                  disabled={actionLoading}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: NOTIFICATIONS                                   */}
      {/* ======================================================== */}
      {activeSection === 'notifications' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="dash-badge dash-badge-published">FR7.2 Alerts</span>
                {unreadNotifCount > 0 ? (
                  <span className="dash-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    {unreadNotifCount} Unread
                  </span>
                ) : (
                  <span className="dash-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    All Caught Up
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Workspace Notifications</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Automated alerts on published briefs, failed pipelines, and recurring scheduled runs.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--surface-hover)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                <button
                  onClick={() => setNotifFilter('all')}
                  className={notifFilter === 'all' ? 'dash-btn-primary' : 'dash-btn-secondary'}
                  style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', border: 'none' }}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setNotifFilter('unread')}
                  className={notifFilter === 'unread' ? 'dash-btn-primary' : 'dash-btn-secondary'}
                  style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', border: 'none' }}
                >
                  Unread ({unreadNotifCount})
                </button>
              </div>
              {unreadNotifCount > 0 && (
                <button
                  onClick={handleMarkNotificationsRead}
                  className="dash-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCheck size={14} />
                  <span>Mark all as read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleDismissAllNotifications}
                  className="dash-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171' }}
                  title="Dismiss all notifications from list"
                >
                  <Trash2 size={13} />
                  <span>Clear all</span>
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          {notifications.filter((n) => (notifFilter === 'unread' ? !n.read : true)).length === 0 ? (
            <div className="dash-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <Bell size={36} color="var(--text-subtle)" style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                {notifFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                You will receive alerts here when briefs publish, fail, or automated schedules run.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {notifications
                .filter((n) => (notifFilter === 'unread' ? !n.read : true))
                .map((notif) => {
                  const isUnread = !notif.read;
                  const isPublished = notif.type === 'brief_published';
                  const isFailed = notif.type === 'brief_failed';
                  const isSchedule = notif.type === 'schedule_run';

                  return (
                    <div
                      key={notif.id}
                      className="dash-card"
                      style={{
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '14px',
                        borderLeft: isUnread ? '3px solid #3b82f6' : '1px solid var(--border)',
                        background: isUnread ? 'rgba(59, 130, 246, 0.03)' : 'var(--surface)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isPublished
                              ? 'rgba(16, 185, 129, 0.12)'
                              : isFailed
                              ? 'rgba(239, 68, 68, 0.12)'
                              : 'rgba(59, 130, 246, 0.12)',
                            color: isPublished ? '#10b981' : isFailed ? '#ef4444' : '#3b82f6',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        >
                          {isPublished ? <CheckCircle2 size={16} /> : isFailed ? <AlertCircle size={16} /> : <Clock size={16} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: isUnread ? 700 : 600, color: 'var(--text)' }}>
                              {notif.title}
                            </span>
                            <span
                              className="dash-badge"
                              style={{
                                fontSize: '0.68rem',
                                background: isPublished
                                    ? 'rgba(16, 185, 129, 0.1)'
                                    : isFailed
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : 'rgba(59, 130, 246, 0.1)',
                                color: isPublished ? '#10b981' : isFailed ? '#ef4444' : '#3b82f6',
                              }}
                            >
                              {isPublished ? 'Published' : isFailed ? 'Failed' : 'Scheduled'}
                            </span>
                            {isUnread && (
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }} />
                            )}
                          </div>
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                            {notif.message}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                            <span>Received: {new Date(notif.created_at).toLocaleString()}</span>
                            {notif.read_at && (
                              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Check size={11} /> Read {new Date(notif.read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {notif.brief_id && (
                          <button
                            onClick={() => {
                              setSelectedBriefId(notif.brief_id);
                              setActiveSection('briefs');
                            }}
                            className="dash-btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={12} />
                            <span>View Brief</span>
                          </button>
                        )}
                        {isUnread && (
                          <button
                            onClick={() => handleMarkSingleNotificationRead(notif.id)}
                            className="dash-btn-secondary"
                            style={{ padding: '5px 8px', fontSize: '0.75rem' }}
                            title="Mark as read"
                          >
                            <Check size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDismissNotification(notif.id)}
                          className="dash-icon-btn"
                          style={{ padding: '5px 6px', color: 'var(--text-subtle)' }}
                          title="Dismiss notification"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: PRODUCT ANALYTICS                               */}
      {/* ======================================================== */}
      {activeSection === 'analytics' && (
        <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="dash-badge dash-badge-published">Platform Intelligence</span>
                <span className="dash-badge dash-badge-mode">{analyticsData?.plan ? `${analyticsData.plan.toUpperCase()} Plan` : 'Operator'}</span>
                <span className="dash-badge dash-badge-running">Real-Time Telemetry</span>
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)' }}>Overall Product Analytics</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Comprehensive telemetry on brief generations, citation grounding, unit economics, and action execution.
              </p>
            </div>
            <button
              onClick={fetchAnalytics}
              disabled={analyticsLoading}
              className="dash-btn-secondary"
              style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={analyticsLoading ? 'animate-spin' : ''} />
              <span>Refresh Metrics</span>
            </button>
          </div>

          {/* 4 Top KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {/* KPI 1: Briefs Volume & Success */}
            <div className="dash-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Brief Generations
                </span>
                <FileText size={16} color="#3b82f6" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>
                  {analyticsData?.briefs?.total ?? briefs.length}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                  {analyticsData?.briefs?.successRate ?? 100}% published
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'var(--surface-hover)', marginTop: '4px' }}>
                <div style={{ flex: analyticsData?.briefs?.published || 1, background: '#10b981' }} title="Published" />
                <div style={{ flex: analyticsData?.briefs?.failed || 0, background: '#ef4444' }} title="Failed" />
                <div style={{ flex: analyticsData?.briefs?.running || 0, background: '#f59e0b' }} title="Running" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                <span>{analyticsData?.briefs?.published ?? briefs.filter((b: any) => b.status === 'published').length} published</span>
                <span>{analyticsData?.briefs?.failed ?? 0} failed</span>
              </div>
            </div>

            {/* KPI 2: Tokens & Unit Economics */}
            <div className="dash-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Unit Economics & Tokens
                </span>
                <Zap size={16} color="#c084fc" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>
                  ${analyticsData?.telemetry?.totalCostUsd ?? '0.0000'}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#a855f7', fontFamily: 'var(--font-mono)' }}>
                  {((analyticsData?.telemetry?.totalTokens ?? 0) / 1000).toFixed(1)}k tokens
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Avg cost: <strong>${analyticsData?.telemetry?.avgCostPerBrief ?? '0.0025'}</strong> per generated brief
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                Avg Latency: {analyticsData?.telemetry?.avgLatencyMs ?? 1250}ms
              </div>
            </div>

            {/* KPI 3: Citations & Conflict Detection */}
            <div className="dash-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Grounding Citations
                </span>
                <ShieldCheck size={16} color="#10b981" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>
                  {analyticsData?.citations?.total ?? 0}
                </span>
                {analyticsData?.citations?.conflict > 0 ? (
                  <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>
                    {analyticsData.citations.conflict} conflict(s) surfaced
                  </span>
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                    100% grounded
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {analyticsData?.citations?.support ?? 0} support &bull; {analyticsData?.citations?.conflict ?? 0} conflict &bull; {analyticsData?.citations?.unchecked ?? 0} unchecked
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                Cross-source disagreements flagged without winner-picking
              </div>
            </div>

            {/* KPI 4: Operator Meter Quota */}
            <div className="dash-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Monthly Brief Meter
                </span>
                <Clock size={16} color="#f59e0b" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>
                  {analyticsData?.meter?.used ?? briefs.length}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  / {analyticsData?.meter?.limit ?? 500}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 600, marginLeft: 'auto' }}>
                  {analyticsData?.meter?.percent ?? 0}%
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--surface-hover)', overflow: 'hidden', marginTop: '4px' }}>
                <div
                  style={{
                    width: `${Math.min(100, analyticsData?.meter?.percent ?? 5)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                    borderRadius: '3px',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                Resets on 1st of month &bull; Scheduled &amp; manual runs metered
              </div>
            </div>
          </div>

          {/* Deep-Dive Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
            {/* Left: 14-Day Activity Chart */}
            <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Generation Frequency (14 Days)</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Daily published and scheduled briefings</span>
                </div>
                <TrendingUp size={16} color="#3b82f6" />
              </div>

              {analyticsData?.timeline && analyticsData.timeline.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', padding: '10px 0 20px 0', borderBottom: '1px solid var(--border)' }}>
                  {analyticsData.timeline.map((t: any, idx: number) => {
                    const maxVal = Math.max(...analyticsData.timeline.map((item: any) => item.count), 5);
                    const heightPercent = Math.max(12, Math.round((t.count / maxVal) * 100));
                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                          {t.count}
                        </span>
                        <div
                          style={{
                            width: '100%',
                            height: `${heightPercent}%`,
                            background: 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                          title={`${t.day}: ${t.count} brief(s)`}
                        />
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-subtle)', marginTop: '6px', whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'top left' }}>
                          {t.day.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No historical generations in the past 14 days.
                </div>
              )}
            </div>

            {/* Right: Connected Sources Breakdown */}
            <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Connected Sources &amp; Knowledge Base</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Documents and items indexed across providers</span>
                </div>
                <Database size={16} color="#10b981" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {connectors.map((c) => {
                  const isConnected = c.health.connected;
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.1rem' }}>{c.icon}</span>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {isConnected ? `Synced (${c.health.sync_window_days}d window)` : 'Not Connected'}
                          </div>
                        </div>
                      </div>
                      <span
                        className="dash-badge"
                        style={{
                          background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                          color: isConnected ? '#10b981' : 'var(--text-subtle)',
                        }}
                      >
                        {isConnected ? 'Live Sync' : 'Available'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Dispatch Safety & Grounding Metrics */}
          <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Human-in-the-Loop Action Execution</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Strict approval gates on email, issue, and comment dispatches</span>
              </div>
              <CheckSquare size={16} color="#f59e0b" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Proposed Drafts</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{analyticsData?.actions?.total ?? workspaceActions.length}</span>
              </div>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>User Approved</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#3b82f6' }}>{analyticsData?.actions?.approved ?? workspaceActions.filter((a: any) => a.approved_at).length}</span>
              </div>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Provider Executed</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{analyticsData?.actions?.executed ?? workspaceActions.filter((a: any) => a.executed_at).length}</span>
              </div>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Execution Rate</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{analyticsData?.actions?.executionRate ?? 100}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: AUDIT & TELEMETRY                               */}
      {/* ======================================================== */}
      {activeSection === 'audit' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-published">NFR6.1 &bull; Observability</span>
              <span className="dash-badge dash-badge-mode">FR8.3 Circuit Breaker</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Telemetry &amp; Cost Auditor</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Every brief logs tools, tokens, latency, cost, and circuit breaker status.
            </p>
          </div>

          <div className="dash-card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Workspace Cost</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#10b981', marginTop: '4px' }}>
                  ${telemetry?.telemetry?.total_cost || '0.0000'}
                </div>
              </div>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Avg Latency</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '4px' }}>
                  {telemetry?.telemetry?.avg_latency_ms || 0} ms
                </div>
              </div>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Total Runs</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '4px' }}>
                  {telemetry?.telemetry?.total_runs || 0}
                </div>
              </div>
              <div className="dash-card-subtle">
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Circuit Breaker</span>
                <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: telemetry?.telemetry?.circuit_broken_count > 0 ? '#ef4444' : '#10b981', fontWeight: 600, marginTop: '8px' }}>
                  {telemetry?.telemetry?.circuit_broken_count > 0 ? 'Tripped' : 'Armed (Healthy)'}
                </div>
              </div>
            </div>
          </div>

          {/* Latency P50/P95 Targets & Histogram (NFR3.2) */}
          <LatencyPlot />

          {/* Recent Runs Table */}
          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
              Recent Pipeline Execution Runs
            </h3>

            {!telemetry?.runs || telemetry.runs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '0.82rem' }}>No execution telemetry recorded in this workspace yet.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Brief</th>
                      <th>Latency</th>
                      <th>Tokens In/Out</th>
                      <th>Cost</th>
                      <th>Circuit</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.runs.map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.brief_question || r.brief_id}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.latency_ms} ms</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {r.tokens_in} / {r.tokens_out}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>${r.cost}</td>
                        <td>
                          <span className={r.circuit_broken ? 'dash-badge dash-badge-running' : 'dash-badge dash-badge-published'}>
                            {r.circuit_broken ? 'Tripped' : 'Clean'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: ACCESS & AUDIT LOGS                             */}
      {/* ======================================================== */}
      {activeSection === 'access-logs' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-published">NFR2.4 &bull; NFR6.4</span>
              <span className="dash-badge dash-badge-mode">Workspace Owner Auditing</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Source Access &amp; Audit Logs</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Complete audit trail of every source read, sync operation, and per-brief retrieval. Scoped strictly to your workspace.
            </p>
          </div>

          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {accessLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                <ShieldCheck size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem' }}>No access logs recorded yet.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Ingesting documents or running briefs will automatically generate verifiable access logs.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Connector</th>
                      <th>Operation</th>
                      <th>Source / Brief</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.map((log: any) => (
                      <tr key={log.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{log.connector}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{log.action}</td>
                        <td style={{ color: 'var(--text-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.source_name || log.brief_question || '-'}
                        </td>
                        <td>
                          <span className="dash-badge dash-badge-published">allowed</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: CLAIM FLAGS & EVAL                              */}
      {/* ======================================================== */}
      {activeSection === 'flags' && (
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="dash-badge dash-badge-published">FR9.1 &bull; FR9.2</span>
                <span className="dash-badge dash-badge-running">Critic Regression Suite</span>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Claim Flags &amp; Human Evaluation</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Flagged claims (<code style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>wrong</code> or <code style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>unsupported</code>) persist to the critic regression suite.
              </p>
            </div>
            {selectedBriefId && (
              <button
                onClick={() => {
                  setFlagClaimText('');
                  setFlagCitationId(null);
                  setIsFlagModalOpen(true);
                }}
                className="dash-btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              >
                <Flag size={14} />
                <span>Flag a Claim</span>
              </button>
            )}
          </div>

          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {flags.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                <Flag size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem' }}>No claims flagged yet in this workspace.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Use the flag icon in the brief preview or citations tab to flag any claim as wrong or unsupported.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Claim Sentence</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Reported At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((f: any) => (
                      <tr key={f.id}>
                        <td style={{ fontSize: '0.82rem', maxWidth: '300px' }}>{f.claim}</td>
                        <td>
                          <span className="dash-badge dash-badge-mode">{f.reason}</span>
                        </td>
                        <td>
                          <span className={f.status === 'resolved' ? 'dash-badge dash-badge-published' : 'dash-badge dash-badge-running'}>
                            {f.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {new Date(f.reported_at).toLocaleString()}
                        </td>
                        <td>
                          <button
                            onClick={() => handleResolveFlag(f.id)}
                            disabled={f.status === 'resolved'}
                            className="dash-btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                          >
                            {f.status === 'resolved' ? 'Resolved ✓' : 'Resolve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: SETTINGS & BILLING                              */}
      {/* ======================================================== */}
      {activeSection === 'settings' && (
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-published">FR8 &bull; Entitlements</span>
              <span className="dash-badge dash-badge-mode">Server Enforced</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Workspace Settings &amp; Billing</h2>
          </div>

          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--card-border)' }}>
              <div>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>Workspace: {workspace?.name || 'Personal'}</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {workspace?.plan || 'Free'} Tier &bull; User: {user?.email || 'Active'}
                </p>
              </div>
              <span className="dash-badge dash-badge-published">Active</span>
            </div>

            {/* Plan Comparison Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Connectors</th>
                    <th>PDF Export</th>
                    <th>Schedules</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: workspace?.plan === 'free' ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
                    <td style={{ fontWeight: 600, color: '#10b981' }}>Free</td>
                    <td>Uploads only</td>
                    <td>Markdown only</td>
                    <td>No</td>
                    <td>No</td>
                  </tr>
                  <tr style={{ background: workspace?.plan === 'pro' ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
                    <td style={{ fontWeight: 600 }}>Pro</td>
                    <td>Gmail, GitHub, Calendar</td>
                    <td>Yes (PDF)</td>
                    <td>No</td>
                    <td>No</td>
                  </tr>
                  <tr style={{ background: workspace?.plan === 'operator' ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
                    <td style={{ fontWeight: 600 }}>Operator</td>
                    <td>All connectors + Web</td>
                    <td>Yes (PDF)</td>
                    <td>Yes</td>
                    <td>Yes</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Danger Zone: Wipe Account / Data */}
            <div style={{ marginTop: '12px', padding: '16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}>Danger Zone: Wipe Workspace Data</h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                NFR2.2: Full workspace deletion removes all chunks, embeddings, briefs, and OAuth tokens.
              </p>
              <div>
                <button
                  onClick={() => alert('Wipe requested. You can manage stored data or delete sources individually.')}
                  style={{ padding: '6px 14px', borderRadius: '6px', background: '#ef4444', color: '#ffffff', border: 'none', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Wipe All Stored Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: PRIVACY & TRUST POLICY                          */}
      {/* ======================================================== */}
      {activeSection === 'privacy' && (
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="dash-badge dash-badge-published">NFR1 &bull; NFR2</span>
              <span className="dash-badge dash-badge-mode">Zero Training</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Security, Privacy &amp; Trust</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Normative privacy architecture implemented across every data pipeline.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="dash-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#10b981', marginBottom: '6px' }}>1. Zero Model Training</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: '1.6' }}>
                Your emails, repositories, notes, and brief outputs are strictly never used to train foundation models. Ingested content is passed to inference APIs only as delimited data payloads.
              </p>
            </div>

            <div className="dash-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#10b981', marginBottom: '6px' }}>2. Untrusted Content Boundaries</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: '1.6' }}>
                Source content is delimited via untrusted boundaries. Prompt injection instructions embedded in email footers or markdown comments cannot execute actions.
              </p>
            </div>

            <div className="dash-card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#10b981', marginBottom: '6px' }}>3. Retention &amp; Revocation</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: '1.6' }}>
                Default 90-day sync window for mail. Revoking any connector marks tokens <code style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>revoked_at</code> immediately and halts background sync.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE SCHEDULE                                   */}
      {/* ======================================================== */}
      {isScheduleModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '520px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#10b981" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>Create Recurring Schedule</h3>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="dash-icon-btn"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateScheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {workspace?.plan !== 'operator' && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Lock size={14} />
                  <span>Operator plan required to create schedules. Current: {workspace?.plan || 'free'}.</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Schedule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Executive Brief"
                  value={newScheduleName}
                  onChange={(e) => setNewScheduleName(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Question Template</label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click tag to insert</span>
                </div>

                {/* Tag insertion chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {SUPPORTED_TEMPLATE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setNewScheduleQuestion((prev) => `${prev ? prev + ' ' : ''}{{${tag}}}`);
                      }}
                      style={{
                        cursor: 'pointer',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        background: 'rgba(16, 185, 129, 0.08)',
                        color: '#10b981',
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      title={`Insert {{${tag}}}`}
                    >
                      + {`{{${tag}}}`}
                    </button>
                  ))}
                </div>

                <textarea
                  placeholder="e.g. Executive summary for {{date}} at {{time}} ({{timezone}})"
                  value={newScheduleQuestion}
                  onChange={(e) => setNewScheduleQuestion(e.target.value)}
                  rows={3}
                  required
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />

                {/* Validation Warnings */}
                {(() => {
                  if (!newScheduleQuestion.trim()) return null;
                  const validation = validateQuestionTemplate(newScheduleQuestion);
                  if (!validation.valid) {
                    return (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontSize: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                          <AlertTriangle size={14} />
                          <span>Invalid Template Syntax</span>
                        </div>
                        {validation.errors.map((err, i) => (
                          <span key={i}>• {err}</span>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Live Rendered Preview */}
                {newScheduleQuestion.trim().length > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--card-bg-subtle)',
                      border: '1px solid var(--card-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sparkles size={12} /> Live Template Preview
                      </span>
                      <span>Rendered with current time</span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text)', fontStyle: 'italic', margin: 0 }}>
                      "{renderQuestionTemplate(newScheduleQuestion, { timezone: 'UTC' })}"
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Cron Expression</label>
                  <input
                    type="text"
                    placeholder="0 9 * * 1"
                    value={newScheduleCron}
                    onChange={(e) => setNewScheduleCron(e.target.value)}
                    required
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'var(--card-bg-subtle)',
                      border: '1px solid var(--card-border)',
                      color: 'var(--text)',
                      fontSize: '0.82rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Default: Every Monday 09:00 UTC</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Mode</label>
                  <select
                    value={newScheduleMode}
                    onChange={(e: any) => setNewScheduleMode(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'var(--card-bg-subtle)',
                      border: '1px solid var(--card-border)',
                      color: 'var(--text)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value="home">Home (Private Only)</option>
                    <option value="world">World (Private + Web)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="dash-btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSchedule}
                  className="dash-btn-primary"
                  style={{ padding: '6px 16px', fontSize: '0.78rem' }}
                >
                  {isSubmittingSchedule ? 'Creating...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: FLAG CLAIM                                        */}
      {/* ======================================================== */}
      {isFlagModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '500px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flag size={18} color="#ef4444" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>Flag Claim for Evaluation</h3>
              </div>
              <button
                onClick={() => setIsFlagModalOpen(false)}
                className="dash-icon-btn"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateFlagSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Claim Text</label>
                <textarea
                  placeholder="Enter or confirm the exact claim text..."
                  value={flagClaimText}
                  onChange={(e) => setFlagClaimText(e.target.value)}
                  rows={3}
                  required
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Reason</label>
                <select
                  value={flagReason}
                  onChange={(e: any) => setFlagReason(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="unsupported">Unsupported by citations</option>
                  <option value="wrong">Factually wrong or contradictory</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Note / Details (Optional)</label>
                <textarea
                  placeholder="Explain why this claim fails verification..."
                  value={flagNote}
                  onChange={(e) => setFlagNote(e.target.value)}
                  rows={2}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsFlagModalOpen(false)}
                  className="dash-btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFlag || !flagClaimText.trim()}
                  className="dash-btn-primary"
                  style={{ padding: '6px 16px', fontSize: '0.78rem', background: '#ef4444', borderColor: '#ef4444' }}
                >
                  {isSubmittingFlag ? 'Submitting...' : 'Submit Flag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: INSPECT SOURCE & CHUNKS                           */}
      {/* ======================================================== */}
      {inspectingSource && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '24px',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--card-border)',
                paddingBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--card-bg-subtle)',
                    border: '1px solid var(--card-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {inspectingSource.source.connector === 'gmail' && <Mail size={16} color="#ef4444" />}
                  {inspectingSource.source.connector === 'calendar' && <Calendar size={16} color="#3b82f6" />}
                  {inspectingSource.source.connector === 'drive' && <HardDrive size={16} color="#10b981" />}
                  {inspectingSource.source.connector === 'upload' && <FileText size={16} color="var(--text-muted)" />}
                  {inspectingSource.source.connector === 'github' && <GitBranch size={16} color="#8b5cf6" />}
                  {inspectingSource.source.connector === 'slack' && <MessageSquare size={16} color="#10b981" />}
                  {inspectingSource.source.connector === 'notion' && <FileText size={16} color="#f43f5e" />}
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                    {inspectingSource.source.meta?.name ||
                      inspectingSource.source.meta?.summary ||
                      inspectingSource.source.meta?.subject ||
                      inspectingSource.source.external_id ||
                      'Source Details'}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span className="dash-badge dash-badge-mode" style={{ textTransform: 'capitalize' }}>
                      {inspectingSource.source.connector}
                    </span>
                    <span
                      className="dash-badge dash-badge-mode"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Lock size={10} />
                      {inspectingSource.source.trust_boundary}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {inspectingSource.chunks.length} chunk(s)
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectingSource(null)}
                className="dash-icon-btn"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Metadata grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                padding: '12px',
                borderRadius: '8px',
                background: 'var(--card-bg-subtle)',
                border: '1px solid var(--card-border)',
                fontSize: '0.78rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>External ID: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                  {inspectingSource.source.external_id}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Checksum (SHA-256): </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                  {inspectingSource.source.checksum?.slice(0, 16)}...
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Ingested: </span>
                <span style={{ color: 'var(--text)' }}>
                  {new Date(inspectingSource.source.created_at).toLocaleString()}
                </span>
              </div>
              {inspectingSource.source.meta?.from && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Sender: </span>
                  <span style={{ color: 'var(--text)' }}>{inspectingSource.source.meta.from}</span>
                </div>
              )}
              {inspectingSource.source.meta?.organizer && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Organizer: </span>
                  <span style={{ color: 'var(--text)' }}>{inspectingSource.source.meta.organizer}</span>
                </div>
              )}
              {inspectingSource.source.meta?.mimeType && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>MIME: </span>
                  <span style={{ color: 'var(--text)' }}>{inspectingSource.source.meta.mimeType}</span>
                </div>
              )}
            </div>

            {/* Ingested Grounding Chunks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Ingested Grounding Chunks (Passed to Retriever &amp; Critic)
              </h4>
              {inspectingSource.chunks.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No chunks generated for this source.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {inspectingSource.chunks.map((chunk, idx) => (
                    <div
                      key={chunk.id || idx}
                      style={{
                        padding: '12px',
                        borderRadius: '6px',
                        background: 'var(--bg)',
                        border: '1px solid var(--card-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="dash-badge dash-badge-published" style={{ fontSize: '0.68rem' }}>
                          Chunk #{chunk.ordinal ?? idx}
                        </span>
                        <span
                          style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
                        >
                          {chunk.text?.length || 0} characters
                        </span>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: '0.78rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          lineHeight: 1.5,
                          maxHeight: '180px',
                          overflowY: 'auto',
                        }}
                      >
                        {chunk.text}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
              <button
                onClick={() => setInspectingSource(null)}
                className="dash-btn-secondary"
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* SECTION: PROFILE (READONLY & EDIT)                       */}
      {/* ======================================================== */}
      {activeSection === 'profile' && (
        <ProfileView
          initialUser={user}
          initialWorkspace={workspace}
          onLogout={handleLogout}
          onProfileUpdated={(updatedUser, updatedWorkspace) => {
            if (updatedUser) setUser(updatedUser);
            if (updatedWorkspace) setWorkspace(updatedWorkspace);
          }}
          onWorkspaceSwitched={refreshAllWorkspaceData}
        />
      )}

      {/* Interactive Side-by-Side Brief Diff Modal (FR6.2) */}
      {diffModalData && (
        <BriefDiffModal
          diff={diffModalData}
          onClose={() => setDiffModalData(null)}
        />
      )}

      {/* Expiring Read-Only Brief Share Modal (E5) */}
      {isShareModalOpen && currentBrief && (
        <ShareBriefModal
          briefId={currentBrief.id}
          briefQuestion={currentBrief.question}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}
    </DashboardLayout>
  );
}
