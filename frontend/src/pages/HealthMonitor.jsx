import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Server,
  Shield,
  KeyRound,
  Database,
  Cpu,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ui/Toast';
import { systemApi } from '../api/system';
import { formatDate } from '../lib/utils';

export function HealthMonitor() {
  const [health, setHealth] = useState(null);
  const [ready, setReady] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState('30'); // seconds, '0' = off
  const [showRawJson, setShowRawJson] = useState(false);

  const toast = useToast();
  const timerRef = useRef(null);

  const fetchAllHealthData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const [hRes, rRes, dRes] = await Promise.allSettled([
        systemApi.getHealth(),
        systemApi.getReady(),
        systemApi.getDiagnostics(),
      ]);

      if (hRes.status === 'fulfilled') setHealth(hRes.value);
      if (rRes.status === 'fulfilled') setReady(rRes.value);
      if (dRes.status === 'fulfilled') setDiagnostics(dRes.value);

      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      toast.error('Failed to update health diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllHealthData(true);
  }, [fetchAllHealthData]);

  // Setup auto-refresh timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const intervalSec = parseInt(autoRefreshInterval, 10);
    if (intervalSec > 0) {
      timerRef.current = setInterval(() => {
        fetchAllHealthData(false);
      }, intervalSec * 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshInterval, fetchAllHealthData]);

  const isSystemHealthy =
    health?.status === 'ok' &&
    ready?.ready === true &&
    diagnostics?.database?.status === 'healthy';

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return '—';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health Monitor"
        description="Real-time subsystem diagnostics, liveness probes, upstream providers, and circuit breaker telemetry."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Auto-Refresh:</span>
              <div className="w-28">
                <Select
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="0">Off</option>
                  <option value="10">Every 10s</option>
                  <option value="30">Every 30s</option>
                  <option value="60">Every 60s</option>
                </Select>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchAllHealthData(false)}
              disabled={refreshing || loading}
              className="gap-2 h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Global Status Banner */}
      <Card className={isSystemHealthy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  isSystemHealthy
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}
              >
                {isSystemHealthy ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base text-foreground">
                    {isSystemHealthy ? 'All Systems Operational' : 'System Degraded or Initializing'}
                  </h3>
                  <Badge variant={isSystemHealthy ? 'success' : 'warning'}>
                    {isSystemHealthy ? 'HEALTHY' : 'ATTENTION'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gateway core routing engine and API endpoints are accepting incoming completions traffic.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-muted-foreground border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0 sm:pl-6">
              <div>
                <p className="text-[11px] text-muted-foreground">Gateway Uptime</p>
                <p className="font-mono font-medium text-foreground mt-0.5">
                  {formatUptime(health?.uptime_seconds)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Environment</p>
                <p className="font-mono font-medium text-foreground uppercase mt-0.5">
                  {diagnostics?.system?.environment || health?.environment || 'development'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Last Checked</p>
                <p className="font-mono font-medium text-foreground mt-0.5">
                  {lastRefreshed ? new Date(lastRefreshed).toLocaleTimeString() : '—'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subsystem Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Database Connectivity */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                PostgreSQL Database
              </CardTitle>
              {diagnostics?.database?.status === 'healthy' ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="destructive">Error</Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Primary state store & connection pool
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b">
                  <dt className="text-muted-foreground">Ping Latency</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {diagnostics?.database?.latency_ms !== undefined
                      ? `${diagnostics.database.latency_ms} ms`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-1 border-b">
                  <dt className="text-muted-foreground">Connection Status</dt>
                  <dd className="font-medium text-emerald-600 dark:text-emerald-400 capitalize">
                    {diagnostics?.database?.status || 'Unknown'}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <dt className="text-muted-foreground">Diagnostic Message</dt>
                  <dd className="text-muted-foreground truncate max-w-[160px]" title={diagnostics?.database?.message}>
                    {diagnostics?.database?.message || 'Ready for queries'}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Security & Cryptography */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Encryption Subsystem
              </CardTitle>
              <Badge variant="success">Operational</Badge>
            </div>
            <CardDescription className="text-xs">
              At-rest secret protection & envelope encryption
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b">
                  <dt className="text-muted-foreground">Algorithm</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {diagnostics?.encryption_service?.algorithm || 'AES-256-GCM'}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-1 border-b">
                  <dt className="text-muted-foreground">Master Key</dt>
                  <dd className="font-medium text-emerald-600 dark:text-emerald-400">
                    {diagnostics?.encryption_service?.key_configured ? '256-bit Configured' : 'Missing'}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <dt className="text-muted-foreground">Auth Authentication</dt>
                  <dd className="font-mono text-muted-foreground">
                    Argon2id + JWT HS256
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Gateway Runtime */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Runtime & Process
              </CardTitle>
              <Badge variant="secondary">v{diagnostics?.system?.version || '0.1.0'}</Badge>
            </div>
            <CardDescription className="text-xs">
              ASGI server & execution environment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b">
                  <dt className="text-muted-foreground">Python Version</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {diagnostics?.system?.python_version || '3.12.x'}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-1 border-b">
                  <dt className="text-muted-foreground">Host Platform</dt>
                  <dd className="font-mono text-muted-foreground capitalize">
                    {diagnostics?.system?.platform || 'windows'}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-1">
                  <dt className="text-muted-foreground">Liveness Probe</dt>
                  <dd className="font-mono text-emerald-600 dark:text-emerald-400">
                    GET /health (200 OK)
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operational State Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Upstream Providers Health */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                Upstream Providers
              </CardTitle>
              <Badge variant="outline">
                {diagnostics?.providers?.active || 0} / {diagnostics?.providers?.total || 0} Active
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Configured upstream LLM adapters
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : diagnostics?.providers?.items?.length ? (
              <div className="space-y-2">
                {diagnostics.providers.items.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border p-2.5 text-xs bg-muted/20"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          p.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'
                        }`}
                      />
                      <span className="font-medium text-foreground capitalize">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {p.credentials_count} {p.credentials_count === 1 ? 'Key' : 'Keys'}
                      </span>
                      <Badge variant={p.is_active ? 'success' : 'secondary'} className="text-[10px] px-1.5 py-0">
                        {p.is_active ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No providers configured yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Credentials Health Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Credentials Status
              </CardTitle>
              <Badge variant="outline">{diagnostics?.credentials?.total || 0} Total</Badge>
            </div>
            <CardDescription className="text-xs">
              Health, cooldowns & error state
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border p-2.5 bg-emerald-500/5 border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[11px]">Healthy</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {diagnostics?.credentials?.healthy || 0}
                  </p>
                </div>

                <div className="rounded-md border p-2.5 bg-amber-500/5 border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[11px]">In Cooldown</span>
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
                    {diagnostics?.credentials?.cooldown || 0}
                  </p>
                </div>

                <div className="rounded-md border p-2.5 bg-red-500/5 border-red-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[11px]">Degraded / Error</span>
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-red-600 dark:text-red-400">
                    {diagnostics?.credentials?.degraded || 0}
                  </p>
                </div>

                <div className="rounded-md border p-2.5 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[11px]">Total Keys</span>
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-foreground">
                    {diagnostics?.credentials?.total || 0}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Circuit Breakers Overview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Circuit Breakers
              </CardTitle>
              <Badge variant="outline">{diagnostics?.circuit_breakers?.total || 0} Monitored</Badge>
            </div>
            <CardDescription className="text-xs">
              Automated trip & recovery states
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border p-2.5 text-center bg-emerald-500/5 border-emerald-500/20">
                  <span className="text-[10px] uppercase font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    CLOSED
                  </span>
                  <p className="mt-1 font-mono text-lg font-bold text-foreground">
                    {diagnostics?.circuit_breakers?.closed || 0}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Normal</span>
                </div>

                <div className="rounded-md border p-2.5 text-center bg-amber-500/5 border-amber-500/20">
                  <span className="text-[10px] uppercase font-mono text-amber-600 dark:text-amber-400 font-semibold">
                    HALF-OPEN
                  </span>
                  <p className="mt-1 font-mono text-lg font-bold text-foreground">
                    {diagnostics?.circuit_breakers?.half_open || 0}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Testing</span>
                </div>

                <div className="rounded-md border p-2.5 text-center bg-red-500/5 border-red-500/20">
                  <span className="text-[10px] uppercase font-mono text-red-600 dark:text-red-400 font-semibold">
                    OPEN
                  </span>
                  <p className="mt-1 font-mono text-lg font-bold text-foreground">
                    {diagnostics?.circuit_breakers?.open || 0}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Tripped</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Raw Health Diagnostics JSON Accordion */}
      <Card>
        <CardHeader className="py-3 cursor-pointer select-none" onClick={() => setShowRawJson(!showRawJson)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showRawJson ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <CardTitle className="text-xs font-mono font-medium">
                Raw Infrastructure Diagnostics Payload
              </CardTitle>
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              GET /api/admin/health/diagnostics
            </span>
          </div>
        </CardHeader>
        {showRawJson && (
          <CardContent className="pt-0">
            <pre className="rounded-md bg-muted/40 p-4 font-mono text-xs overflow-x-auto text-foreground border max-h-96">
              {JSON.stringify({ health, ready, diagnostics }, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
export default HealthMonitor;
