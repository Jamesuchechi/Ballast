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
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useTheme } from '@/components/theme/ThemeProvider';
import { IntegrationsMarketplace, type ConnectorItem } from '@/components/dashboard/IntegrationsMarketplace';

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

  // Ingestion & Generation UI States
  const [pasteText, setPasteText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<any[]>([]);
  const [queryPrompt, setQueryPrompt] = useState('');
  const [briefFilter, setBriefFilter] = useState<'all' | 'home' | 'world'>('all');
  const [actionLoading, setActionLoading] = useState(false);

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

  // Source Inspection & Filter States
  const [sourceFilterConnector, setSourceFilterConnector] = useState<string>('all');
  const [inspectingSource, setInspectingSource] = useState<{ source: any; chunks: any[] } | null>(null);
  const [isLoadingInspection, setIsLoadingInspection] = useState(false);

  // ----------------------------------------------------
  // Data Fetching Functions
  // ----------------------------------------------------

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
              let displayName = s.meta?.name || s.meta?.summary || s.meta?.subject;
              if (!displayName) {
                if (s.connector === 'gmail') {
                  displayName = s.meta?.from ? `Email from ${s.meta.from}` : (s.external_id || 'Gmail Message');
                } else if (s.connector === 'calendar') {
                  displayName = s.meta?.organizer ? `Meeting (${s.meta.organizer})` : 'Calendar Event';
                } else if (s.connector === 'drive') {
                  displayName = 'Google Drive Document';
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

  const fetchGmailStatus = fetchConnectors;

  // ----------------------------------------------------
  // Lifecycle Initializer
  // ----------------------------------------------------

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
          fetchFlags(),
          fetchTelemetry(),
          fetchConnectors(),
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

      // Poll progress until published or failed
      const interval = setInterval(async () => {
        try {
          const progRes = await fetch(`/api/briefs/${briefId}/progress`);
          if (progRes.ok) {
            const pData = await progRes.json();
            if (pData.progress) {
              setGenerationSteps(pData.progress);
            }
            if (pData.status === 'published') {
              clearInterval(interval);
              setIsGenerating(false);
              setQueryPrompt('');
              await Promise.all([
                fetchBriefs(),
                fetchAccessLogs(),
                fetchActions(),
                fetchTelemetry(),
              ]);
              setSelectedBriefId(briefId);
            } else if (pData.status === 'failed') {
              clearInterval(interval);
              setIsGenerating(false);
              alert('Brief generation failed: ' + (pData.error || 'Validation error'));
            }
          }
        } catch (e) {
          console.warn('Progress poll error:', e);
        }
      }, 400);
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
      const data = await res.json();
      if (data.childBrief) {
        await Promise.all([
          fetchBriefs(),
          fetchAccessLogs(),
          fetchActions(),
          fetchTelemetry(),
        ]);
        setSelectedBriefId(data.childBrief.id);
      } else {
        alert(data.error || 'Failed to regenerate brief');
      }
    } catch (err: any) {
      alert('Regeneration error: ' + err.message);
    } finally {
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
    try {
      const res = await fetch(`/api/connectors/${connector.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowDays: syncWindowDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || `${connector.name} sync failed`);
      } else {
        await Promise.all([fetchConnectors(), fetchSources(), fetchAccessLogs()]);
      }
    } catch (e: any) {
      alert(`Sync error: ${e.message}`);
    } finally {
      setSyncingConnectors((prev) => ({ ...prev, [connector.id]: false }));
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

  // Filtered briefs for selector tabs
  const filteredBriefs = useMemo(() => {
    if (briefFilter === 'all') return briefs;
    return briefs.filter((b) => (b.mode || 'home') === briefFilter);
  }, [briefs, briefFilter]);

  const renderSourcesTable = (title: string, description?: string) => {
    const filtered = uploadedFiles.filter((f) => {
      if (sourceFilterConnector === 'all') return true;
      return f.connector === sourceFilterConnector;
    });

    const gmailCount = uploadedFiles.filter((f) => f.connector === 'gmail').length;
    const calCount = uploadedFiles.filter((f) => f.connector === 'calendar').length;
    const driveCount = uploadedFiles.filter((f) => f.connector === 'drive').length;
    const uploadCount = uploadedFiles.filter((f) => f.connector === 'upload').length;

    return (
      <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
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
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
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
      theme={theme}
      onToggleTheme={toggleTheme}
      isDemo={isDemo}
    >
      {/* ======================================================== */}
      {/* SECTION: BRIEFS ARCHIVE                                   */}
      {/* ======================================================== */}
      {activeSection === 'briefs' && (
        <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Query Bar for Grounded Ingestion */}
          <div
            className="dash-card"
            style={{
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              border: mode === 'world' ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(16, 185, 129, 0.28)',
              background: mode === 'world'
                ? 'linear-gradient(to right, rgba(6, 182, 212, 0.10), transparent)'
                : 'linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)',
              boxShadow: mode === 'world' ? '0 0 16px rgba(6, 182, 212, 0.12)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="dash-badge"
                  style={{
                    background: mode === 'world' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: mode === 'world' ? '#06b6d4' : '#10b981',
                    border: `1px solid ${mode === 'world' ? 'rgba(6, 182, 212, 0.5)' : 'rgba(16, 185, 129, 0.4)'}`,
                    fontWeight: 700,
                  }}
                >
                  {mode === 'world' ? 'World Mode (Private + Web)' : 'Home Mode (Private Only)'}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                  {mode === 'world'
                    ? 'Dual-pass retrieval across workspace sources and snapshot-backed live web'
                    : 'Grounded retrieval strictly within workspace sources and mail'}
                </span>
              </div>
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
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
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
                    ? "Ask a World query across private docs & live web (e.g. 'What are Stripe webhook security requirements?' or enter a topic)..."
                    : "Ask a question grounded in your uploads (e.g. 'What are the outstanding deliverables for Q3 revamp?')..."
                }
                disabled={isGenerating}
                style={{
                  flex: 1,
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
                  padding: '8px 18px',
                  fontSize: '0.82rem',
                  whiteSpace: 'nowrap',
                  background: mode === 'world' ? 'linear-gradient(135deg, #0891b2, #06b6d4)' : undefined,
                  borderColor: mode === 'world' ? '#0891b2' : undefined,
                }}
              >
                {isGenerating ? 'Synthesizing...' : mode === 'world' ? 'Generate World Brief' : 'Generate Home Brief'}
              </button>
            </div>

            {/* Quick Suggestion Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Try prompt:</span>
              {mode === 'world' ? (
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
                    Stripe Webhook Signatures
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
                    GDPR Article 6 Consent
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryPrompt('HTTP 429 Too Many Requests retry-after header standard')}
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
                    HTTP 429 Rate Limits
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
                    Q3 Billing Deliverables
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
                    Merchant Accounts Status
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryPrompt('What database migration scripts are ready for replica dry run?')}
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
                    Database Migrations
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
                          {isSelected && <span style={{ fontSize: '0.75rem', color: isWorld ? '#06b6d4' : '#10b981' }}>✓</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

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
                    <span className="dash-badge dash-badge-published">
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
                      {currentBrief.markdown.split('\n\n').map((block: string, idx: number) => {
                        if (block.startsWith('# ')) return null; // Main title in header
                        if (block.startsWith('## ')) {
                          const lines = block.split('\n');
                          const heading = lines[0].replace('## ', '');
                          const rest = lines.slice(1);
                          return (
                            <div key={idx} style={{ marginBottom: '24px' }}>
                              <h2 className="dash-section-title">{heading}</h2>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {rest.map((line, lineIdx) => {
                                  const trimmed = line.trim();
                                  if (!trimmed) return null;
                                  if (trimmed.startsWith('### ')) {
                                    return (
                                      <h3
                                        key={lineIdx}
                                        style={{
                                          fontSize: '0.74rem',
                                          fontFamily: 'var(--font-mono)',
                                          textTransform: 'uppercase',
                                          color: 'var(--text-muted)',
                                          marginTop: '10px',
                                          marginBottom: '4px',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {trimmed.replace('### ', '')}
                                      </h3>
                                    );
                                  } else if (trimmed.startsWith('- Claim: ')) {
                                    const claimText = trimmed.replace(/^- Claim:\s*/, '');
                                    return (
                                      <div
                                        key={lineIdx}
                                        style={{
                                          padding: '8px 12px',
                                          borderRadius: '8px',
                                          background: 'var(--card-bg-subtle)',
                                          border: '1px solid var(--card-border)',
                                          fontSize: '0.85rem',
                                          color: 'var(--text)',
                                          marginTop: '6px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: '8px',
                                        }}
                                      >
                                        <div>
                                          <strong style={{ color: '#10b981' }}>Claim:</strong> {claimText}
                                        </div>
                                        <button
                                          onClick={() => {
                                            setFlagClaimText(claimText);
                                            setIsFlagModalOpen(true);
                                          }}
                                          className="dash-icon-btn"
                                          title="Flag claim (wrong or unsupported)"
                                        >
                                          <Flag size={13} color="var(--text-muted)" />
                                        </button>
                                      </div>
                                    );
                                  } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                    return (
                                      <div key={lineIdx} className="dash-list-item">
                                        {trimmed.replace(/^[-*]\s*/, '')}
                                      </div>
                                    );
                                  } else if (trimmed.startsWith('  - ')) {
                                    return (
                                      <div
                                        key={lineIdx}
                                        style={{
                                          marginLeft: '16px',
                                          fontSize: '0.8rem',
                                          fontStyle: 'italic',
                                          color: 'var(--text-muted)',
                                          borderLeft: '2px solid rgba(16, 185, 129, 0.4)',
                                          paddingLeft: '8px',
                                          marginTop: '2px',
                                        }}
                                      >
                                        {trimmed.replace(/^\s*-\s*/, '')}
                                      </div>
                                    );
                                  }
                                  return (
                                    <p key={lineIdx} style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text)' }}>
                                      {trimmed}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <p key={idx} style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text)' }}>
                            {block}
                          </p>
                        );
                      })}
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
                      {briefDetail.citations.map((c: any, idx: number) => (
                        <div
                          key={c.id || idx}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: 'var(--card-bg-subtle)',
                            border: '1px solid var(--card-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span
                              className="dash-badge"
                              style={{
                                background: c.source_class === 'web' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: c.source_class === 'web' ? '#06b6d4' : '#10b981',
                                border: `1px solid ${c.source_class === 'web' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
                                fontWeight: 700,
                              }}
                            >
                              [{c.source_class || 'private'}] &bull; {c.citation_type || 'support'}
                            </span>
                            <button
                              onClick={() => {
                                setFlagClaimText(c.quote || '');
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
                          <blockquote
                            style={{
                              fontSize: '0.85rem',
                              fontStyle: 'italic',
                              color: 'var(--text)',
                              borderLeft: `2px solid ${c.source_class === 'web' ? '#06b6d4' : '#10b981'}`,
                              paddingLeft: '10px',
                              margin: '4px 0',
                            }}
                          >
                            “{c.quote}”
                          </blockquote>
                          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                            ID: {c.id} {c.url ? `• Source: ${c.url}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Actions */}
              {activeTab === 'actions' && (
                <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                      Pending Action Drafts ({briefDetail?.actions?.length || 0})
                    </h3>
                    <span className="dash-badge dash-badge-published">Human Gate Enforced</span>
                  </div>

                  {!briefDetail?.actions || briefDetail.actions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.82rem' }}>No follow-up action drafts generated for this brief.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {briefDetail.actions.map((act: any) => {
                        const isApproved = !!act.approved_at;
                        const isExecuted = !!act.executed_at;
                        const hasError = !!act.error;
                        return (
                          <div key={act.id} className="dash-card-subtle" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="dash-badge dash-badge-running">{act.type}</span>
                                {isExecuted && <span className="dash-badge dash-badge-published">Executed</span>}
                                {hasError && <span className="dash-badge dash-badge-failed">Error</span>}
                              </div>
                              <button
                                onClick={() => handleApproveAction(act.id)}
                                disabled={isApproved}
                                className={isApproved ? 'dash-btn-secondary' : 'dash-btn-primary'}
                                style={{ padding: '4px 12px', fontSize: '0.72rem' }}
                              >
                                {isExecuted ? 'Executed ✓' : isApproved ? 'Approved ✓' : 'Approve Draft'}
                              </button>
                            </div>
                            <pre className="dash-code-box">{JSON.stringify(act.payload, null, 2)}</pre>
                            {hasError && (
                              <div style={{ fontSize: '0.72rem', color: '#ef4444', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '4px' }}>
                                <strong>Error:</strong> {act.error}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <IntegrationsMarketplace
            connectors={connectors}
            uploadedCount={uploadedFiles.filter((u) => u.connector === 'upload').length}
            syncingConnectors={syncingConnectors}
            onConnect={handleConnectConnector}
            onSync={handleSyncConnector}
            onRevoke={handleRevokeConnector}
            onSaveToken={handleSaveToken}
            onNavigateUploads={() => setActiveSection('upload')}
            initialError={initialError}
            initialMessage={initialMessage}
          />

          {/* Live Evidence Stream from Connected Sources */}
          {renderSourcesTable(
            'Synced Live Knowledge & Evidence',
            'Real-time items synced from your connected accounts (Gmail, Google Calendar, Google Drive).'
          )}
        </div>
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
              <span className="dash-badge dash-badge-published">FR6.1 &bull; FR6.2</span>
              <span className="dash-badge dash-badge-mode">Parent-Child Revision Lineage</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Version Chains &amp; Brief Diff</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Regenerate stubs insert a new child row with <code style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>parent_brief_id</code>, never modifying published history in-place.
            </p>
          </div>

          <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--card-border)' }}>
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                  {currentBrief ? currentBrief.question : 'No Brief Selected'}
                </h3>
                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {currentBrief?.parent_brief_id
                    ? `Child revision of brief ${currentBrief.parent_brief_id.slice(0, 8)}...`
                    : 'Root Brief (v1)'}
                </span>
              </div>
              {currentBrief && (
                <button
                  onClick={handleRegenerate}
                  disabled={actionLoading}
                  className="dash-btn-primary"
                  style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                >
                  <GitBranch size={14} />
                  <span>Create Revision</span>
                </button>
              )}
            </div>

            {/* Real Diff Display */}
            {briefDetail?.parentBrief ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                    Unified Evidence Diff (Parent &rarr; Current Revision):
                  </div>
                  <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    Comparing {briefDetail.parentBrief.id.slice(0, 8)} to {currentBrief.id.slice(0, 8)}
                  </span>
                </div>

                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: '#000000', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '14px', overflowX: 'auto', lineHeight: '1.7' }}>
                  {unifiedDiffLines.map((line, idx) => {
                    if (line.type === 'add') {
                      return (
                        <div key={idx} style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 4px' }}>
                          + {line.text}
                        </div>
                      );
                    }
                    if (line.type === 'del') {
                      return (
                        <div key={idx} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '1px 4px' }}>
                          - {line.text}
                        </div>
                      );
                    }
                    return (
                      <div key={idx} style={{ color: '#cbd5e1' }}>
                        &nbsp; {line.text}
                      </div>
                    );
                  })}
                </div>
              </div>
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
              <span className="dash-badge dash-badge-running">FR5.1 &ndash; FR5.7</span>
              <span className="dash-badge dash-badge-published">Human Gate Enforced</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Pending Follow-up Actions</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Actions are drafted by the system but require explicit user approval before execution. Unapproved drafts never touch external APIs.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {workspaceActions.map((act: any) => {
                const isApproved = !!act.approved_at;
                const isExecuted = !!act.executed_at;
                const hasError = !!act.error;
                return (
                  <div key={act.id} className="dash-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: hasError ? '1px solid rgba(239, 68, 68, 0.35)' : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="dash-badge dash-badge-running">{act.type}</span>
                        {isExecuted && <span className="dash-badge dash-badge-published">Executed</span>}
                        {hasError && <span className="dash-badge dash-badge-failed">Error</span>}
                        {act.brief_question && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            from: {act.brief_question}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleApproveAction(act.id)}
                        disabled={isApproved}
                        className={isApproved ? 'dash-btn-secondary' : 'dash-btn-primary'}
                        style={{ padding: '6px 14px', fontSize: '0.75rem' }}
                      >
                        {isExecuted ? 'Executed ✓' : isApproved ? 'Approved ✓' : 'Approve Draft'}
                      </button>
                    </div>
                    <pre className="dash-code-box">{JSON.stringify(act.payload, null, 2)}</pre>
                    {hasError && (
                      <div style={{ fontSize: '0.74rem', color: '#ef4444', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <strong>Provider Execution Error:</strong> {act.error}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                      <span>Created: {new Date(act.created_at).toLocaleString()}</span>
                      {act.approved_at && <span>Approved: {new Date(act.approved_at).toLocaleString()}</span>}
                      {act.executed_at && <span style={{ color: '#10b981' }}>Executed: {new Date(act.executed_at).toLocaleString()}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>Question Template</label>
                <textarea
                  placeholder="e.g. What are the key blockers and outstanding deliverables since last week?"
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
    </DashboardLayout>
  );
}
