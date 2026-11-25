import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CheckCircle2, AlertTriangle, Server, ShieldCheck, KeyRound, Database } from 'lucide-react';
import { systemApi } from '../../api/system';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { StatusBadge } from '../ui/StatusBadge';
import { TimetableStrip, TimetableCell } from '../ui/Timetable';
import { Skeleton } from '../ui/Skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui/Table';
import { formatDate, formatLatency } from '../../lib/utils';

export function HealthMonitorPanel() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const {
    data: health,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['system-health-detail'],
    queryFn: systemApi.getHealth,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const {
    data: ready,
    isLoading: isReadyLoading,
    refetch: refetchReady,
  } = useQuery({
    queryKey: ['system-ready-detail'],
    queryFn: systemApi.getReady,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const {
    data: diagnostics,
    isLoading: isDiagLoading,
    isFetching: isDiagFetching,
    refetch: refetchDiag,
  } = useQuery({
    queryKey: ['system-diagnostics'],
    queryFn: systemApi.getDiagnostics,
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const runFullCheck = () => {
    refetchHealth();
    refetchReady();
    refetchDiag();
  };

  const dbCheck = ready?.checks?.database || diagnostics?.database || {};
  const isApiHealthy = health?.status === 'ok' || health?.status === 'healthy';
  const isDbReady = ready?.ready === true || ready?.status === 'ready' || dbCheck?.status === 'healthy';
  const dbLatency = dbCheck?.latency_ms;

  const cbStats = diagnostics?.circuit_breakers || {};
  const credStats = diagnostics?.credentials || {};
  const provStats = diagnostics?.providers || {};

  const providerItems = Array.isArray(provStats) ? provStats : provStats.items || [];
  const credentialItems = Array.isArray(credStats) ? credStats : credStats.items || [];

  const openCircuits =
    cbStats.open ??
    diagnostics?.summary?.open_circuits ??
    providerItems.filter((p) => String(p.circuit_state).toLowerCase() === 'open').length;

  const healthyCreds =
    credStats.healthy ??
    diagnostics?.summary?.healthy_credentials ??
    credentialItems.filter((c) => c.health_status === 'healthy').length;
  const totalCreds =
    credStats.total ?? diagnostics?.summary?.total_credentials ?? credentialItems.length;
  const cooldownCreds =
    credStats.cooldown ?? diagnostics?.summary?.cooldown_credentials ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2.5">
          {isApiHealthy && isDbReady ? (
            <CheckCircle2 className="h-4 w-4 text-status-ok" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-status-warn" />
          )}
          <div>
            <span className="text-xs font-semibold text-foreground block">
              Live Control Plane Diagnostics
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              Polling <code>/health</code>, <code>/ready</code>, and <code>/api/admin/health/diagnostics</code>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="health-auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Auto-refresh health diagnostics every 10 seconds"
            />
            <label htmlFor="health-auto-refresh" className="font-mono text-[11px] text-muted-foreground">
              10s Polling
            </label>
          </div>
          <Button variant="outline" size="sm" onClick={runFullCheck} disabled={isDiagFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isDiagFetching ? 'animate-spin' : ''}`} />
            Run Check
          </Button>
        </div>
      </div>

      {/* Diagnostic KPI Strip */}
      <TimetableStrip>
        <TimetableCell
          label="API Liveness"
          tag="/HEALTH"
          loading={isHealthLoading}
          value={isApiHealthy ? 'HEALTHY' : (health?.status || 'UNKNOWN').toUpperCase()}
          tone={isApiHealthy ? 'ok' : 'err'}
          subtext={
            health?.version
              ? `Version ${health.version}${health?.uptime_seconds !== undefined ? ` · ${health.uptime_seconds}s up` : ''}`
              : 'FastAPI worker responsive'
          }
        />
        <TimetableCell
          label="Database Readiness"
          tag="/READY"
          loading={isReadyLoading}
          value={isDbReady ? 'CONNECTED' : 'DEGRADED'}
          tone={isDbReady ? 'ok' : 'err'}
          subtext={
            dbLatency !== undefined
              ? `Round-trip ${formatLatency(dbLatency)}`
              : 'PostgreSQL pool status'
          }
        />
        <TimetableCell
          label="Open Circuit Breakers"
          tag="FAILOVER"
          loading={isDiagLoading}
          value={String(openCircuits)}
          tone={openCircuits > 0 ? 'err' : 'ok'}
          subtext={`${cbStats.closed ?? 0} closed · ${cbStats.half_open ?? 0} half-open`}
        />
        <TimetableCell
          label="Healthy Credentials"
          tag="POOL"
          loading={isDiagLoading}
          value={`${healthyCreds}/${totalCreds}`}
          subtext={`${cooldownCreds} cooldown · ${credStats.degraded ?? 0} degraded`}
        />
      </TimetableStrip>

      {/* Core Subsystem Integrity Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" />
              PostgreSQL Pool
            </span>
            <StatusBadge status={diagnostics?.database?.status || (isDbReady ? 'healthy' : 'unhealthy')} />
          </div>
          <p className="font-mono text-xs text-foreground">
            {diagnostics?.database?.message || 'Relational control store responsive'}
          </p>
          {dbLatency !== undefined && (
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Query probe: {formatLatency(dbLatency)}
            </p>
          )}
        </div>

        <div className="rounded border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Secret Encryption
            </span>
            <StatusBadge status={diagnostics?.encryption_service?.status || 'operational'} />
          </div>
          <p className="font-mono text-xs text-foreground">
            {diagnostics?.encryption_service?.algorithm || 'AES-256-GCM'}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            Master key loaded: {diagnostics?.encryption_service?.key_configured === false ? 'No' : 'Yes'}
          </p>
        </div>

        <div className="rounded border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Auth &amp; Runtime
            </span>
            <StatusBadge status={diagnostics?.auth_service?.status || 'operational'} />
          </div>
          <p className="font-mono text-xs text-foreground">
            {diagnostics?.auth_service?.algorithm || 'Argon2id + JWT'}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {diagnostics?.system?.environment || 'production'} · Python {diagnostics?.system?.python_version || '3.12'}
          </p>
        </div>
      </section>

      {/* Provider Circuit & Health Ledger */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-5 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Upstream Provider State Matrix
          </h3>
          <span className="font-mono text-[11px] text-muted-foreground">
            {provStats.active ?? providerItems.length}/{provStats.total ?? providerItems.length} active
          </span>
        </div>
        {isDiagLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : providerItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground font-mono">
            {provStats.total
              ? `${provStats.active || 0} of ${provStats.total} providers active (${cbStats.closed ?? 0} circuits closed). Visit Providers or Routing for per-adapter details.`
              : 'No upstream providers registered in diagnostics snapshot.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Circuit Breaker</TableHead>
                <TableHead className="text-right">Consecutive Failures</TableHead>
                <TableHead>Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providerItems.map((p) => (
                <TableRow key={p.provider_id || p.id || p.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{p.display_name || p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.is_enabled === false ? 'disabled' : p.health_status || 'healthy'} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.circuit_state || 'closed'} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-foreground">
                    {p.failure_count ?? p.consecutive_failures ?? 0}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.last_check_at || p.updated_at ? formatDate(p.last_check_at || p.updated_at) : 'Real-time'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Credential Cooldown & Health Watchlist */}
      {credentialItems.length > 0 && (
        <section className="rounded border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 sm:px-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Credential Health &amp; Cooldown Watchlist
            </h3>
            <span className="font-mono text-[11px] text-muted-foreground">
              {credentialItems.length} keys tracked
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Cooldown Until</TableHead>
                <TableHead>Last Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentialItems.map((cred) => (
                <TableRow key={cred.credential_id || cred.id}>
                  <TableCell className="font-medium text-foreground">
                    {cred.label}
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase text-muted-foreground">
                    {cred.provider_name || '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cred.health_status || 'healthy'} />
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {cred.cooldown_until ? formatDate(cred.cooldown_until) : 'None'}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-status-err max-w-xs truncate">
                    {cred.last_error_category || cred.last_error_message || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
export default HealthMonitorPanel;
