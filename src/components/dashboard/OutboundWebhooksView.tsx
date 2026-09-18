'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Webhook,
  Plus,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit2,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Shield,
  Send,
  Eye,
  EyeOff,
  Radio,
  Sliders,
  Sparkles,
  Info,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { OutboundWebhookRecord, OutboundWebhookEvent } from '@/core/types';

interface OutboundWebhooksViewProps {
  onNavigateConnectors?: () => void;
  onNavigateBriefs?: () => void;
}

const EVENT_OPTIONS: { id: OutboundWebhookEvent; label: string; description: string; badgeColor: string }[] = [
  {
    id: 'brief.published',
    label: 'brief.published',
    description: 'Fired when a research brief passes Critic verification and publishes',
    badgeColor: 'rgba(16, 185, 129, 0.15)',
  },
  {
    id: 'brief.failed',
    label: 'brief.failed',
    description: 'Fired if brief generation encounters an error or verification fails',
    badgeColor: 'rgba(239, 68, 68, 0.15)',
  },
  {
    id: 'connector.synced',
    label: 'connector.synced',
    description: 'Fired when a connector sync or re-index pass completes',
    badgeColor: 'rgba(59, 130, 246, 0.15)',
  },
  {
    id: 'action.executed',
    label: 'action.executed',
    description: 'Fired when a proposed action draft is executed or dispatched',
    badgeColor: 'rgba(245, 158, 11, 0.15)',
  },
  {
    id: '*',
    label: '* (All Events)',
    description: 'Wildcard: receive all current and future workspace events',
    badgeColor: 'rgba(168, 85, 247, 0.15)',
  },
];

export function OutboundWebhooksView({
  onNavigateConnectors,
  onNavigateBriefs,
}: OutboundWebhooksViewProps) {
  const [webhooks, setWebhooks] = useState<OutboundWebhookRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<OutboundWebhookRecord | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<OutboundWebhookEvent[]>(['brief.published']);
  const [isActiveInput, setIsActiveInput] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Test Webhook State
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    webhookId: string;
    success: boolean;
    statusCode?: number;
    latencyMs: number;
    message: string;
    snippet?: string;
  } | null>(null);

  // Secrets Visibility
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  // Load webhooks from API
  const fetchWebhooks = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      setError(null);
      const res = await fetch('/api/webhooks/outbound');
      if (!res.ok) {
        throw new Error(`Failed to load webhooks: HTTP ${res.status}`);
      }
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching outbound webhooks');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const openCreateModal = () => {
    setEditingWebhook(null);
    setUrlInput('');
    setDescInput('');
    setSecretInput('');
    setSelectedEvents(['brief.published']);
    setIsActiveInput(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (wh: OutboundWebhookRecord) => {
    setEditingWebhook(wh);
    setUrlInput(wh.url);
    setDescInput(wh.description || '');
    setSecretInput(wh.secret);
    setSelectedEvents(wh.events || ['brief.published']);
    setIsActiveInput(wh.is_active);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      setModalError('Destination URL is required.');
      return;
    }
    if (selectedEvents.length === 0) {
      setModalError('Select at least one event to subscribe to.');
      return;
    }

    try {
      setIsSaving(true);
      setModalError(null);

      const endpoint = editingWebhook
        ? `/api/webhooks/outbound/${editingWebhook.id}`
        : '/api/webhooks/outbound';
      const method = editingWebhook ? 'PATCH' : 'POST';

      const payload: any = {
        url: urlInput.trim(),
        description: descInput.trim() || null,
        events: selectedEvents,
        isActive: isActiveInput,
      };
      if (secretInput.trim()) {
        payload.secret = secretInput.trim();
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save webhook.');
      }

      setIsModalOpen(false);
      setSuccessToast(
        editingWebhook
          ? 'Webhook configuration updated successfully.'
          : 'New outbound webhook registered.'
      );
      setTimeout(() => setSuccessToast(null), 4000);
      await fetchWebhooks();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save webhook.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this outbound webhook?')) return;
    try {
      const res = await fetch(`/api/webhooks/outbound/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete webhook');
      }
      setSuccessToast('Webhook deleted.');
      setTimeout(() => setSuccessToast(null), 3000);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err: any) {
      alert(err.message || 'Error deleting webhook');
    }
  };

  const handleToggleActive = async (wh: OutboundWebhookRecord) => {
    try {
      const updatedActive = !wh.is_active;
      // Optimistic update
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, is_active: updatedActive } : w))
      );

      const res = await fetch(`/api/webhooks/outbound/${wh.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: updatedActive }),
      });

      if (!res.ok) {
        // Rollback
        setWebhooks((prev) =>
          prev.map((w) => (w.id === wh.id ? { ...w, is_active: wh.is_active } : w))
        );
        throw new Error('Failed to update status');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating active state');
    }
  };

  const handleTestWebhook = async (id: string) => {
    try {
      setTestingWebhookId(id);
      setTestResult(null);
      const res = await fetch(`/api/webhooks/outbound/${id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({
        webhookId: id,
        success: Boolean(data.success),
        statusCode: data.result?.statusCode,
        latencyMs: data.result?.latencyMs || 0,
        message: data.message || (data.success ? 'Delivery successful' : 'Delivery failed'),
        snippet: data.result?.responseSnippet,
      });
      // Refresh list to update delivery status
      fetchWebhooks();
    } catch (err: any) {
      setTestResult({
        webhookId: id,
        success: false,
        latencyMs: 0,
        message: err.message || 'Failed to dispatch test payload',
      });
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleCopySecret = (whId: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecretId(whId);
    setTimeout(() => setCopiedSecretId(null), 2500);
  };

  const toggleRevealSecret = (whId: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [whId]: !prev[whId] }));
  };

  const toggleEventSelection = (eventId: OutboundWebhookEvent) => {
    if (eventId === '*') {
      setSelectedEvents((prev) => (prev.includes('*') ? ['brief.published'] : ['*']));
      return;
    }
    setSelectedEvents((prev) => {
      const filtered = prev.filter((e) => e !== '*');
      if (filtered.includes(eventId)) {
        const next = filtered.filter((e) => e !== eventId);
        return next.length === 0 ? ['brief.published'] : next;
      } else {
        return [...filtered, eventId];
      }
    });
  };

  // Metrics summary
  const activeCount = useMemo(() => webhooks.filter((w) => w.is_active).length, [webhooks]);
  const healthyCount = useMemo(
    () => webhooks.filter((w) => w.last_status_code && w.last_status_code >= 200 && w.last_status_code < 300).length,
    [webhooks]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: 'rgba(16, 185, 129, 0.95)',
            color: '#fff',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)',
            fontWeight: 500,
            fontSize: '0.9rem',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.75rem 2rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ maxWidth: '650px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <Webhook size={20} />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground, #f8fafc)' }}>
              Outbound Webhooks & Automations
            </h1>
            <span
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              Feature E11
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Trigger real-time automation workflows in <strong>Zapier</strong>, <strong>Make</strong>, <strong>n8n</strong>, 
            or custom web services when briefs are published, generations fail, or connector sync passes complete.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => fetchWebhooks(true)}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1rem',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={openCreateModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              borderRadius: '10px',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
            }}
          >
            <Plus size={16} />
            <span>Add Webhook</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Endpoints
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc' }}>
              {activeCount}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              / {webhooks.length} total
            </span>
          </div>
        </div>

        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            HMAC Signatures
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#34d399' }}>
              SHA-256 Enabled
            </span>
            <Shield size={16} color="#34d399" />
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Header: X-Ballast-Signature
          </span>
        </div>

        <div
          style={{
            padding: '1.25rem',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Supported Triggers
          </span>
          <span style={{ fontSize: '1.25rem', fontWeight: 600, color: '#818cf8' }}>
            4 Core Events
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            brief.published, brief.failed, sync, action
          </span>
        </div>
      </div>

      {/* Test Result Toast Banner if active */}
      {testResult && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '12px',
            backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {testResult.success ? (
              <CheckCircle2 size={20} color="#10b981" />
            ) : (
              <AlertCircle size={20} color="#ef4444" />
            )}
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: testResult.success ? '#10b981' : '#ef4444' }}>
                {testResult.message}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Status: {testResult.statusCode ? `HTTP ${testResult.statusCode}` : 'None'} | Latency: {testResult.latencyMs}ms
                {testResult.snippet ? ` | Response: "${testResult.snippet.slice(0, 80)}"` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={() => setTestResult(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Webhook Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
            <span>Loading outbound webhooks...</span>
          </div>
        ) : webhooks.length === 0 ? (
          <div
            style={{
              padding: '3.5rem 2rem',
              textAlign: 'center',
              backgroundColor: 'rgba(30, 41, 59, 0.4)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
            }}
          >
            <Webhook size={48} color="#64748b" style={{ margin: '0 auto 1rem', opacity: 0.7 }} />
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600 }}>
              No Outbound Webhooks Configured
            </h3>
            <p style={{ margin: '0 auto 1.5rem', maxWidth: '480px', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Connect Ballast to external tools like Zapier, Make, n8n, or your internal API by setting up an outbound destination URL.
            </p>
            <button
              onClick={openCreateModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              <Plus size={16} />
              <span>Create First Webhook</span>
            </button>
          </div>
        ) : (
          webhooks.map((wh) => {
            const isRevealed = Boolean(revealedSecrets[wh.id]);
            const isTesting = testingWebhookId === wh.id;
            const hasError = wh.last_status_code && (wh.last_status_code < 200 || wh.last_status_code >= 300);
            const isHealthy = wh.last_status_code && wh.last_status_code >= 200 && wh.last_status_code < 300;

            return (
              <div
                key={wh.id}
                style={{
                  padding: '1.5rem',
                  backgroundColor: 'rgba(30, 41, 59, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  transition: 'border-color 0.2s',
                  opacity: wh.is_active ? 1 : 0.75,
                }}
              >
                {/* Top Row: Description / URL & Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                        {wh.description || 'Webhook Endpoint'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '12px',
                          fontWeight: 500,
                          backgroundColor: wh.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                          color: wh.is_active ? '#34d399' : '#94a3b8',
                          border: `1px solid ${wh.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                        }}
                      >
                        {wh.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code
                        style={{
                          fontSize: '0.85rem',
                          color: '#93c5fd',
                          backgroundColor: 'rgba(15, 23, 42, 0.6)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          wordBreak: 'break-all',
                        }}
                      >
                        {wh.url}
                      </code>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleTestWebhook(wh.id)}
                      disabled={isTesting || !wh.is_active}
                      title="Send immediate diagnostic ping payload"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.45rem 0.85rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(99, 102, 241, 0.15)',
                        color: '#a5b4fc',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        cursor: wh.is_active ? 'pointer' : 'not-allowed',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      <Zap size={14} className={isTesting ? 'animate-spin' : ''} />
                      <span>{isTesting ? 'Testing...' : 'Test Payload'}</span>
                    </button>

                    <button
                      onClick={() => handleToggleActive(wh)}
                      title={wh.is_active ? 'Disable webhook' : 'Enable webhook'}
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      {wh.is_active ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      onClick={() => openEditModal(wh)}
                      title="Edit webhook configuration"
                      style={{
                        padding: '0.45rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      <Edit2 size={15} />
                    </button>

                    <button
                      onClick={() => handleDeleteWebhook(wh.id)}
                      title="Delete webhook"
                      style={{
                        padding: '0.45rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#f87171',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Subscribed Events Pills */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: '0.25rem' }}>
                    Subscribed:
                  </span>
                  {wh.events.map((ev) => {
                    const opt = EVENT_OPTIONS.find((o) => o.id === ev);
                    return (
                      <span
                        key={ev}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '8px',
                          backgroundColor: opt?.badgeColor || 'rgba(255, 255, 255, 0.08)',
                          color: '#e2e8f0',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          fontWeight: 500,
                        }}
                      >
                        {ev}
                      </span>
                    );
                  })}
                </div>

                {/* Secret Key Row & Delivery Status */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {/* Secret Display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={14} color="#94a3b8" />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Signing Secret:</span>
                    <code
                      style={{
                        fontSize: '0.8rem',
                        color: '#cbd5e1',
                        backgroundColor: 'rgba(15, 23, 42, 0.7)',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {isRevealed ? wh.secret : '••••••••••••••••••••••••••••'}
                    </code>
                    <button
                      onClick={() => toggleRevealSecret(wh.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '0.1rem',
                      }}
                      title={isRevealed ? 'Hide Secret' : 'Reveal Secret'}
                    >
                      {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => handleCopySecret(wh.id, wh.secret)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedSecretId === wh.id ? '#34d399' : '#94a3b8',
                        cursor: 'pointer',
                        padding: '0.1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        fontSize: '0.75rem',
                      }}
                      title="Copy Secret"
                    >
                      {copiedSecretId === wh.id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedSecretId === wh.id && <span>Copied</span>}
                    </button>
                  </div>

                  {/* Delivery Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Last Delivery:</span>
                    {wh.last_status_code ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 600,
                          backgroundColor: isHealthy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isHealthy ? '#34d399' : '#f87171',
                          border: `1px solid ${isHealthy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        }}
                      >
                        {isHealthy ? `✓ HTTP ${wh.last_status_code}` : `✗ HTTP ${wh.last_status_code}`}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Not triggered yet
                      </span>
                    )}

                    {wh.last_triggered_at && (
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        ({new Date(wh.last_triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                  </div>
                </div>

                {/* Show error snippet if any */}
                {wh.last_error && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#f87171',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    Last Error: {wh.last_error}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Integration Guide / Payload Spec Info Card */}
      <div
        style={{
          padding: '1.5rem',
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc', fontWeight: 600 }}>
          <Info size={18} color="#818cf8" />
          <span>Webhook Payload Specification & Signature Verification</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
          Ballast dispatches HTTP POST requests with a standard JSON envelope containing <code>id</code>, <code>event</code>, <code>workspace_id</code>, <code>created_at</code>, and <code>data</code>.
          Verify authenticity using the HMAC SHA-256 signature in header <code>X-Ballast-Signature</code>.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
            <code>X-Ballast-Event</code>: e.g. brief.published
          </span>
          <span style={{ fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
            <code>X-Ballast-Signature</code>: sha256=...
          </span>
          <span style={{ fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
            <code>X-Ballast-Delivery</code>: uuid-v4
          </span>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Webhook size={20} color="#818cf8" />
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                  {editingWebhook ? 'Edit Outbound Webhook' : 'Add Outbound Webhook'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                }}
              >
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* URL Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Destination URL *
                </label>
                <input
                  type="url"
                  placeholder="https://hooks.zapier.com/hooks/catch/... or https://hook.eu1.make.com/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Description Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Description / Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Zapier Executive Digest Pipeline or Slack Notifications"
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Secret Key Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  HMAC Secret Key (Optional, auto-generated if left blank)
                </label>
                <input
                  type="text"
                  placeholder="whsec_..."
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Subscribed Events */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>
                  Subscribed Events *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {EVENT_OPTIONS.map((ev) => {
                    const isChecked = selectedEvents.includes(ev.id) || (selectedEvents.includes('*') && ev.id !== '*');
                    return (
                      <label
                        key={ev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.75rem',
                          padding: '0.6rem 0.75rem',
                          borderRadius: '8px',
                          backgroundColor: isChecked ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(ev.id)}
                          onChange={() => toggleEventSelection(ev.id)}
                          style={{ marginTop: '0.2rem' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                            {ev.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {ev.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Enabled Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="activeToggle"
                  checked={isActiveInput}
                  onChange={(e) => setIsActiveInput(e.target.checked)}
                />
                <label htmlFor="activeToggle" style={{ fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer' }}>
                  Enable this webhook immediately
                </label>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    backgroundColor: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  {isSaving ? 'Saving...' : editingWebhook ? 'Update Webhook' : 'Create Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
