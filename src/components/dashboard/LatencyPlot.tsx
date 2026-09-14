'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Clock, Zap, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface LatencyMetricsResponse {
  targets: {
    home: { p50MaxMs: number; p95MaxMs: number };
    world: { p50MaxMs: number; p95MaxMs: number };
  };
  metrics: {
    overall: { count: number; p50: number; p95: number; avg: number; min: number; max: number };
    home: { count: number; p50: number; p95: number; avg: number; min: number; max: number };
    world: { count: number; p50: number; p95: number; avg: number; min: number; max: number };
  };
  timeSeries: {
    runId: string;
    briefId: string;
    question: string;
    mode: string;
    latencyMs: number;
    createdAt: string;
  }[];
}

export function LatencyPlot() {
  const [data, setData] = useState<LatencyMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'overall' | 'home' | 'world'>('overall');

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/metrics/latency');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load latency metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (!data) {
    return (
      <div className="dash-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
          {isLoading ? 'Loading latency metrics...' : 'No telemetry runs recorded yet.'}
        </div>
      </div>
    );
  }

  const currentStats = data.metrics[selectedMode];
  const homeTargets = data.targets.home;
  const p50Target = homeTargets.p50MaxMs;
  const p95Target = homeTargets.p95MaxMs;

  const filteredTimeSeries = selectedMode === 'overall'
    ? data.timeSeries
    : data.timeSeries.filter((r) => r.mode === selectedMode);

  const maxVal = Math.max(p95Target * 1.1, ...filteredTimeSeries.map((t) => t.latencyMs), 5000);

  return (
    <div className="dash-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="#818cf8" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Generation Latency &amp; Telemetry (NFR3.2)
            </h3>
            <span className="dash-badge dash-badge-mode">Internal Targets</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Internal SLA Targets: Home Mode P50 &le; 4.5s, P95 &le; 12s • World Mode P50 &le; 9s, P95 &le; 25s
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', background: 'var(--input-bg)', borderRadius: '6px', padding: '2px', border: '1px solid var(--card-border)' }}>
            {(['overall', 'home', 'world'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMode(m)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  border: 'none',
                  background: selectedMode === m ? '#818cf8' : 'transparent',
                  color: selectedMode === m ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: selectedMode === m ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={fetchMetrics}
            disabled={isLoading}
            className="dash-icon-btn"
            title="Refresh Latency Data"
            style={{ color: 'var(--text-muted)' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin-animation' : ''} />
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            P50 Latency
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: currentStats.p50 <= p50Target ? '#10b981' : '#f59e0b' }}>
            {currentStats.p50 ? `${(currentStats.p50 / 1000).toFixed(2)}s` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
            Target: &le; {(p50Target / 1000).toFixed(1)}s
          </div>
        </div>

        <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            P95 Latency
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: currentStats.p95 <= p95Target ? '#10b981' : '#ef4444' }}>
            {currentStats.p95 ? `${(currentStats.p95 / 1000).toFixed(2)}s` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
            Target: &le; {(p95Target / 1000).toFixed(1)}s
          </div>
        </div>

        <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            Average Latency
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
            {currentStats.avg ? `${(currentStats.avg / 1000).toFixed(2)}s` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
            Across {currentStats.count} tracked runs
          </div>
        </div>

        <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            Fastest / Slowest
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', marginTop: '4px' }}>
            {(currentStats.min / 1000).toFixed(1)}s / {(currentStats.max / 1000).toFixed(1)}s
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
            Min &amp; Max recorded
          </div>
        </div>
      </div>

      {/* Latency Bar Chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          <span>Recent Execution Runs (Last {filteredTimeSeries.length} jobs)</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
              &le; P50 Target
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f59e0b' }} />
              &le; P95 Target
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#ef4444' }} />
              &gt; P95 Target
            </span>
          </div>
        </div>

        {filteredTimeSeries.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px dashed var(--card-border)', borderRadius: '8px' }}>
            No runs recorded for this mode yet. Generate briefs to collect latency metrics.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', overflowX: 'auto' }}>
            {filteredTimeSeries.map((run, idx) => {
              const heightPct = Math.min(100, Math.max(10, (run.latencyMs / maxVal) * 100));
              let barColor = '#10b981';
              if (run.latencyMs > p95Target) barColor = '#ef4444';
              else if (run.latencyMs > p50Target) barColor = '#f59e0b';

              return (
                <div
                  key={run.runId || idx}
                  title={`${run.question}: ${(run.latencyMs / 1000).toFixed(2)}s (${run.mode})`}
                  style={{
                    flex: '0 0 16px',
                    height: `${heightPct}%`,
                    background: barColor,
                    borderRadius: '3px 3px 0 0',
                    position: 'relative',
                    cursor: 'pointer',
                    opacity: 0.85,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
