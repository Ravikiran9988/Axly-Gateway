import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { analyticsApi } from '../api/analytics';
import { routingApi } from '../api/routing';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { TimetableStrip, TimetableCell } from '../components/ui/Timetable';
import { ChartPanel, SwissChartTooltip, CHART_COLORS, PROVIDER_PALETTE } from '../components/ui/ChartCard';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

const TIME_RANGES = [
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'ALL', value: 'all' },
];

export function Overview() {
  const [timeRange, setTimeRange] = useState('24h');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const toast = useToast();

  const {
    data: overview,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    error: overviewError,
    refetch: refetchOverview,
    isRefetching: isOverviewRefetching,
  } = useQuery({
    queryKey: ['analyticsOverview', timeRange],
    queryFn: () => analyticsApi.getOverview(timeRange),
    refetchInterval: 30000,
  });

  const {
    data: timeseries = [],
    isLoading: isTimeseriesLoading,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: ['analyticsTimeseries', timeRange],
    queryFn: () => analyticsApi.getTimeseries(timeRange, timeRange === '24h' ? 'hour' : 'day'),
    refetchInterval: 30000,
  });

  const {
    data: breakdown = {},
    isLoading: isBreakdownLoading,
    refetch: refetchBreakdown,
  } = useQuery({
    queryKey: ['analyticsBreakdown', timeRange],
    queryFn: () => analyticsApi.getBreakdown(timeRange),
    refetchInterval: 30000,
  });

  const { data: aliases = [], isLoading: isAliasesLoading } = useQuery({
    queryKey: ['routingAliases'],
    queryFn: routingApi.listAliases,
    refetchInterval: 30000,
  });

  const { data: routingHealth = {} } = useQuery({
    queryKey: ['routingHealthOverview'],
    queryFn: routingApi.getRoutingHealth,
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    refetchOverview();
    refetchTimeseries();
    refetchBreakdown();
  };

  const curlExample = `curl -X POST ${window.location.origin}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "fast", "messages": [{"role": "user", "content": "Hello AXLY Gateway!"}]}'`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlExample);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
    toast.info('Onboarding command copied to clipboard');
  };

  const providerSummaries = routingHealth?.providers || [];
  const totalReq = overview?.total_requests || 0;
  const okReq = overview?.successful_requests || 0;
  const errReq = overview?.failed_requests || 0;
  const successRate = overview?.success_rate ?? 100;
  const poolHealthyKeys = providerSummaries.reduce((acc, p) => acc + (p.healthy_credentials || 0), 0);
  const poolCooldownKeys = providerSummaries.reduce((acc, p) => acc + (p.cooldown_credentials || 0), 0);
  const displayHealthyKeys = Math.max(overview?.healthy_credentials || 0, poolHealthyKeys);
  const displayCooldownKeys = Math.max(overview?.cooldown_credentials || 0, poolCooldownKeys);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operational Dashboard"
        description="Live throughput, latency percentiles, estimated token cost, failover recoveries, and track readiness."
        actions={
          <>
            <div
              role="group"
              aria-label="Time range filter"
              className="inline-flex rounded border border-border bg-surface-subtle p-0.5"
            >
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.value}
                  type="button"
                  onClick={() => setTimeRange(tr.value)}
                  className={cn(
                    'rounded-sm px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors',
                    timeRange === tr.value
                      ? 'bg-card text-foreground border border-border'
                      : 'border border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tr.label}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isOverviewRefetching}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isOverviewRefetching && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
          </>
        }
      />

      {isOverviewError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded border border-status-err/40 bg-status-err/10 px-4 py-3 text-xs text-status-err"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load telemetry overview: {overviewError?.message || 'Backend unavailable'}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Signature 4-Column Timetable KPI Strip */}
      <TimetableStrip>
        <TimetableCell
          label="Total Requests"
          tag={timeRange.toUpperCase()}
          loading={isOverviewLoading}
          value={totalReq.toLocaleString()}
          subtext={
            <span>
              <span className="text-status-ok">{okReq.toLocaleString()} OK</span>
              {' · '}
              <span className={errReq > 0 ? 'text-status-err' : 'text-muted-foreground'}>
                {errReq.toLocaleString()} ERR
              </span>
            </span>
          }
        />

        <TimetableCell
          label="Success Rate"
          tag="SLO"
          loading={isOverviewLoading}
          value={`${successRate}%`}
          tone={successRate >= 98 ? 'ok' : successRate >= 90 ? 'warn' : 'err'}
          subtext={`${overview?.failover_count || 0} failover recoveries`}
        />

        <TimetableCell
          label="Tokens & Est. Cost"
          tag="CATALOG"
          loading={isOverviewLoading}
          value={(overview?.total_tokens || 0).toLocaleString()}
          subtext={`Est. $${(overview?.estimated_cost_usd || 0).toFixed(4)} (estimated rate)`}
        />

        <TimetableCell
          label="Mean Latency & Pool"
          tag="RTT"
          loading={isOverviewLoading}
          value={overview?.avg_latency_ms ? `${Math.round(overview.avg_latency_ms)}ms` : '0ms'}
          subtext={
            <span>
              {overview?.active_providers || 0} prov ·{' '}
              <span className="text-status-ok">{displayHealthyKeys} keys ok</span>
              {displayCooldownKeys > 0 && (
                <span className="text-status-warn"> · {displayCooldownKeys} cooldown</span>
              )}
            </span>
          }
        />
      </TimetableStrip>

      {/* First-Run / Empty Traffic Onboarding */}
      {!isOverviewLoading && !isOverviewError && totalReq === 0 && (
        <section className="rounded border border-dashed border-border bg-card p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Ready for first inference request
                </h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No completions have been recorded in this timeframe yet. Configure an upstream provider in{' '}
                <Link to="/providers" className="text-route underline">Providers</Link>, issue a client token in{' '}
                <Link to="/api-keys" className="text-route underline">API Keys</Link>, or send a test call via{' '}
                <Link to="/playground" className="text-route underline">Playground</Link>.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleCopyCurl} className="gap-1.5">
                {copiedCurl ? <Check className="h-3.5 w-3.5 text-status-ok" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedCurl ? 'Copied' : 'Copy cURL'}</span>
              </Button>
              <Link to="/playground">
                <Button size="sm" className="gap-1.5">
                  <span>Open Playground</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
          <pre className="mt-3 rounded border border-border bg-background p-3 font-mono text-[11px] text-muted-foreground overflow-x-auto">
            {curlExample}
          </pre>
        </section>
      )}

      {/* Signature Track Schedule Matrix: Alias Failover Tracks + Upstream Provider Readiness */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="lg:col-span-8 rounded border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Track Schedule &amp; Alias Routes
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active OpenAI model aliases and priority failover sequences.
              </p>
            </div>
            <Link to="/routing" className="font-mono text-[11px] text-route hover:underline">
              Configure routes &rarr;
            </Link>
          </div>

          {isAliasesLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : aliases.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No routing aliases configured yet.{' '}
              <Link to="/routing" className="text-route underline">Create an alias</Link> to define multi-provider failover chains.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-subtle font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Alias</th>
                    <th className="px-4 py-2.5">Failover Track Sequence</th>
                    <th className="px-4 py-2.5 text-right">Attempts</th>
                    <th className="px-4 py-2.5 text-right">Timeout</th>
                    <th className="px-4 py-2.5 text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {aliases.slice(0, 6).map((alias) => {
                    const cands = [...(alias.candidates || [])].sort((a, b) => a.priority - b.priority);
                    return (
                      <tr key={alias.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">
                          {alias.alias_name}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {cands.length === 0 ? (
                            <span className="italic">No candidates assigned</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {cands.map((c, idx) => (
                                <React.Fragment key={c.id || idx}>
                                  {idx > 0 && <span className="text-border">&rarr;</span>}
                                  <span
                                    className={cn(
                                      'rounded-sm border px-1.5 py-0.5 text-[11px]',
                                      idx === 0
                                        ? 'border-route/40 bg-route/10 text-foreground font-semibold'
                                        : 'border-border bg-background text-muted-foreground'
                                    )}
                                  >
                                    {c.provider_name || 'provider'}/{c.model_identifier || 'model'}
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {alias.max_attempts}x
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {alias.timeout_seconds}s
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <StatusBadge status={alias.is_enabled ? 'active' : 'disabled'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Provider Health Dispatch Column */}
        <section className="lg:col-span-4 rounded border border-border bg-card flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Provider Pool Health
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upstream readiness &amp; key counts.
              </p>
            </div>
            <Link to="/providers" className="font-mono text-[11px] text-route hover:underline">
              Manage &rarr;
            </Link>
          </div>
          <div className="p-4 space-y-2.5 flex-1">
            {providerSummaries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No providers registered.
              </p>
            ) : (
              providerSummaries.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded border border-border bg-background px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate">{p.display_name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {p.healthy_credentials}/{p.total_credentials} healthy keys
                    </div>
                  </div>
                  <StatusBadge status={p.is_enabled ? p.status : 'disabled'} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Asymmetric 3:2 Charts Row 1 */}
      <div className="grid gap-5 lg:grid-cols-12">
        <ChartPanel
          className="lg:col-span-8"
          title="Request Volume & Outcome"
          subtitle="Throughput split across successful 2xx responses and 4xx/5xx failures."
          rightMeta={
            overview
              ? `P50 ${overview.p50_latency_ms || 0}ms · P95 ${overview.p95_latency_ms || 0}ms`
              : null
          }
        >
          {isTimeseriesLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : timeseries && timeseries.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeseries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    tickFormatter={(v) => (v.includes(' ') ? v.split(' ')[1] : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<SwissChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="successful"
                    name="Successful"
                    stroke={CHART_COLORS.ok}
                    strokeWidth={2}
                    fill={CHART_COLORS.ok}
                    fillOpacity={0.14}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    name="Failed"
                    stroke={CHART_COLORS.err}
                    strokeWidth={2}
                    fill={CHART_COLORS.err}
                    fillOpacity={0.14}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center text-xs text-muted-foreground font-mono">
              No request activity recorded in window.
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-4"
          title="Provider Allocation"
          subtitle="Share of requests and estimated cost per provider."
        >
          {isBreakdownLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : breakdown?.by_provider && breakdown.by_provider.length > 0 ? (
            <div className="flex flex-col h-60 justify-between">
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown.by_provider}
                      dataKey="requests"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={60}
                      paddingAngle={2}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    >
                      {breakdown.by_provider.map((_, index) => (
                        <Cell key={index} fill={PROVIDER_PALETTE[index % PROVIDER_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<SwissChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 border-t border-border pt-2.5 text-xs">
                {breakdown.by_provider.slice(0, 4).map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <span className="flex items-center gap-2 truncate text-foreground">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[1px]"
                        style={{ backgroundColor: PROVIDER_PALETTE[idx % PROVIDER_PALETTE.length] }}
                      />
                      <span className="truncate font-sans font-medium">{item.name}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {item.requests.toLocaleString()} · ${(item.cost_usd || 0).toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center text-xs text-muted-foreground font-mono">
              No provider traffic recorded yet.
            </div>
          )}
        </ChartPanel>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-5 lg:grid-cols-12">
        <ChartPanel
          className="lg:col-span-7"
          title="Token Throughput"
          subtitle="Combined prompt and completion tokens processed per time bucket."
        >
          {isTimeseriesLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : timeseries && timeseries.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeseries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    tickFormatter={(v) => (v.includes(' ') ? v.split(' ')[1] : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<SwissChartTooltip />} />
                  <Bar dataKey="tokens" name="Total Tokens" fill={CHART_COLORS.route} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground font-mono">
              No token usage recorded.
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-5"
          title="Upstream Latency Trend"
          subtitle="Mean round-trip response latency (ms) and failover events."
          rightMeta={overview ? `P99 ${overview.p99_latency_ms || 0}ms` : null}
        >
          {isTimeseriesLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : timeseries && timeseries.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    tickFormatter={(v) => (v.includes(' ') ? v.split(' ')[1] : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={
                      <SwissChartTooltip
                        valueFormatter={(v, n) => (n.includes('Latency') ? `${Math.round(v)}ms` : v)}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_latency_ms"
                    name="Mean Latency (ms)"
                    stroke={CHART_COLORS.indigo}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failovers"
                    name="Failovers"
                    stroke={CHART_COLORS.warn}
                    strokeWidth={1.75}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground font-mono">
              No latency records available.
            </div>
          )}
        </ChartPanel>
      </div>
    </div>
  );
}
export default Overview;
