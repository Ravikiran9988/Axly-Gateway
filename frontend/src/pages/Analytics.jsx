import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Cell,
} from 'recharts';
import { Download, RefreshCw, Activity } from 'lucide-react';
import { analyticsApi } from '../api/analytics';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { TimetableStrip, TimetableCell } from '../components/ui/Timetable';
import {
  ChartPanel,
  SwissChartTooltip,
  CHART_COLORS,
  PROVIDER_PALETTE,
} from '../components/ui/ChartCard';
import { Skeleton } from '../components/ui/Skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import { formatCurrency } from '../lib/utils';

const TIME_RANGES = [
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'ALL', value: 'all' },
];

export function Analytics() {
  const { addToast } = useToast();
  const [timeRange, setTimeRange] = useState('24h');

  const interval = timeRange === '24h' ? 'hour' : 'day';

  const {
    data: overview,
    isLoading: isOverviewLoading,
    refetch: refetchOverview,
    isFetching: isFetchingOverview,
  } = useQuery({
    queryKey: ['analytics-overview', timeRange],
    queryFn: () => analyticsApi.getOverview(timeRange),
  });

  const {
    data: timeseries = [],
    isLoading: isTimeseriesLoading,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: ['analytics-timeseries', timeRange, interval],
    queryFn: () => analyticsApi.getTimeseries(timeRange, interval),
  });

  const {
    data: breakdown = {},
    isLoading: isBreakdownLoading,
    refetch: refetchBreakdown,
  } = useQuery({
    queryKey: ['analytics-breakdown', timeRange],
    queryFn: () => analyticsApi.getBreakdown(timeRange),
  });

  const handleRefresh = () => {
    refetchOverview();
    refetchTimeseries();
    refetchBreakdown();
  };

  const handleExportSummary = () => {
    const byProvider = breakdown?.by_provider || [];
    const header = ['Provider', 'Requests', 'Share (%)', 'Tokens', 'Estimated Cost (USD)'];
    const totalReqs = Math.max(1, overview?.total_requests || 0);
    const rows = byProvider.map((item) => [
      item.name,
      item.requests || 0,
      (((item.requests || 0) / totalReqs) * 100).toFixed(1),
      item.tokens || 0,
      Number(item.cost_usd || 0).toFixed(6),
    ]);

    const csvLines = [
      `# AXLY Gateway Analytics Summary (${timeRange})`,
      `# Total Requests,${overview?.total_requests || 0}`,
      `# Success Rate,${overview?.success_rate ?? 0}%`,
      `# Total Tokens,${overview?.total_tokens || 0}`,
      `# Estimated Cost USD,${Number(overview?.estimated_cost_usd || 0).toFixed(6)}`,
      header.join(','),
      ...rows.map((r) => r.join(',')),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `axly-analytics-${timeRange}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    addToast(`Exported ${timeRange.toUpperCase()} analytics CSV`, 'success');
  };

  const totalReq = overview?.total_requests || 0;
  const successRate = overview?.success_rate !== undefined ? overview.success_rate : 100;
  const byProvider = breakdown?.by_provider || [];
  const byModel = breakdown?.by_model || [];
  const byStatus = breakdown?.by_status || [];
  const byErrorCategory = breakdown?.by_error_category || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Traffic throughput, percentile latency distribution, per-model volume, and provider cost attribution across selected windows."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={timeRange} onValueChange={setTimeRange} variant="segmented">
              <TabsList>
                {TIME_RANGES.map((tr) => (
                  <TabsTrigger key={tr.value} value={tr.value} className="font-mono text-[11px]">
                    {tr.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetchingOverview}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetchingOverview ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportSummary}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Rule-Divided Percentile & Token KPI Strip */}
      <TimetableStrip>
        <TimetableCell
          label="Total Traffic"
          tag={timeRange.toUpperCase()}
          loading={isOverviewLoading}
          value={totalReq.toLocaleString()}
          subtext={`${successRate}% success · ${overview?.failover_count || 0} failovers`}
        />
        <TimetableCell
          label="P50 Latency"
          tag="PERCENTILES"
          loading={isOverviewLoading}
          value={`${Math.round(overview?.p50_latency_ms || overview?.avg_latency_ms || 0)}ms`}
          subtext={`P95: ${Math.round(overview?.p95_latency_ms || 0)}ms · P99: ${Math.round(overview?.p99_latency_ms || 0)}ms`}
        />
        <TimetableCell
          label="Token Volume"
          tag="I/O"
          loading={isOverviewLoading}
          value={(overview?.total_tokens || 0).toLocaleString()}
          subtext={`${(overview?.prompt_tokens || 0).toLocaleString()} in · ${(overview?.completion_tokens || 0).toLocaleString()} out`}
        />
        <TimetableCell
          label="Estimated Spend"
          tag="CATALOG"
          loading={isOverviewLoading}
          value={formatCurrency(overview?.estimated_cost_usd || 0)}
          subtext={`${overview?.failed_requests || 0} failed completions`}
          tone={(overview?.failed_requests || 0) > 0 ? 'warn' : 'default'}
        />
      </TimetableStrip>

      {/* Primary Time Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartPanel
          title="Request Throughput & Failures"
          subtitle="Completed vs failed inference executions per time bucket."
          rightMeta={`${interval.toUpperCase()} BUCKETS`}
        >
          {isTimeseriesLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : timeseries.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeseries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    tickFormatter={(v) => (v && v.includes(' ') ? v.split(' ')[1] : v)}
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
            <div className="flex h-60 items-center justify-center font-mono text-xs text-muted-foreground">
              No request telemetry recorded for this period.
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          title="Latency & Token Velocity"
          subtitle="Mean round-trip response latency (ms) and failover spikes."
          rightMeta={`MEAN ${Math.round(overview?.avg_latency_ms || 0)}ms`}
        >
          {isTimeseriesLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : timeseries.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    tickFormatter={(v) => (v && v.includes(' ') ? v.split(' ')[1] : v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={
                      <SwissChartTooltip
                        valueFormatter={(v, n) =>
                          n.includes('Latency') ? `${Math.round(v)}ms` : Number(v).toLocaleString()
                        }
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_latency_ms"
                    name="Mean Latency (ms)"
                    stroke={CHART_COLORS.route}
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
            <div className="flex h-60 items-center justify-center font-mono text-xs text-muted-foreground">
              No latency observations available.
            </div>
          )}
        </ChartPanel>
      </div>

      {/* Model Volume + Status/Error Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <ChartPanel
          className="lg:col-span-7"
          title="Model Demand Distribution"
          subtitle="Request volume routed per resolved catalog model."
        >
          {isBreakdownLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : byModel.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byModel.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<SwissChartTooltip />} />
                  <Bar dataKey="requests" name="Requests" radius={[0, 2, 2, 0]}>
                    {byModel.slice(0, 8).map((_, idx) => (
                      <Cell key={idx} fill={PROVIDER_PALETTE[idx % PROVIDER_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center font-mono text-xs text-muted-foreground">
              No per-model completions recorded.
            </div>
          )}
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-5"
          title="Outcome & Failure Classification"
          subtitle="Completion statuses and classified error taxonomy."
        >
          {isBreakdownLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : byStatus.length === 0 && byErrorCategory.length === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center text-center text-xs text-muted-foreground font-mono">
              <Activity className="h-5 w-5 mb-2 opacity-60" />
              No status classifications in window.
            </div>
          ) : (
            <div className="space-y-4">
              {byStatus.length > 0 && (
                <div className="space-y-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status Mix
                  </span>
                  <div className="space-y-2">
                    {byStatus.map((item) => {
                      const pct = totalReq > 0 ? Math.round(((item.count || 0) / totalReq) * 100) : 0;
                      const isOk = String(item.status).toLowerCase() === 'success';
                      return (
                        <div key={item.status} className="space-y-1">
                          <div className="flex justify-between font-mono text-xs">
                            <span className="uppercase text-foreground">{item.status}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {(item.count || 0).toLocaleString()} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-sm bg-surface-subtle overflow-hidden">
                            <div
                              className={isOk ? 'h-full bg-status-ok' : 'h-full bg-status-err'}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {byErrorCategory.length > 0 && (
                <div className="border-t border-border pt-3 space-y-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Error Categories
                  </span>
                  <div className="divide-y divide-border rounded border border-border">
                    {byErrorCategory.map((err) => (
                      <div
                        key={err.category}
                        className="flex items-center justify-between px-3 py-2 font-mono text-xs"
                      >
                        <span className="text-status-err truncate">{err.category}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {(err.count || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ChartPanel>
      </div>

      {/* Provider Performance & Cost Attribution Table */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3.5 sm:px-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Provider Allocation & Cost Ledger
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggregated completions, traffic share, token consumption, and estimated cost per upstream provider.
            </p>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {byProvider.length} active
          </span>
        </div>

        {isBreakdownLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : byProvider.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-muted-foreground">
            No provider performance records available in this window.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Traffic Share</TableHead>
                <TableHead className="text-right">Tokens Consumed</TableHead>
                <TableHead className="text-right">Est. Cost (USD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byProvider.map((p, idx) => {
                const share = totalReq > 0 ? ((p.requests || 0) / totalReq) * 100 : 0;
                return (
                  <TableRow key={p.name}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-[1px] shrink-0"
                          style={{ backgroundColor: PROVIDER_PALETTE[idx % PROVIDER_PALETTE.length] }}
                        />
                        <span className="font-semibold text-foreground">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {(p.requests || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      {share.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {(p.tokens || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold text-foreground">
                      {formatCurrency(p.cost_usd || 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

export default Analytics;
