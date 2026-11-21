import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Coins,
  ShieldAlert,
  Download,
  Calendar,
  Layers,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  Cpu,
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
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { analyticsApi } from '../api/analytics';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';

const TIME_RANGES = [
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'All Time', value: 'all' },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export function Analytics() {
  const [timeRange, setTimeRange] = useState('7d');

  const { data: overview, isLoading: isOverviewLoading } = useQuery({
    queryKey: ['analyticsOverview', timeRange],
    queryFn: () => analyticsApi.getOverview(timeRange),
  });

  const { data: timeseries = [], isLoading: isTimeseriesLoading } = useQuery({
    queryKey: ['analyticsTimeseries', timeRange],
    queryFn: () => analyticsApi.getTimeseries(timeRange, timeRange === '24h' ? 'hour' : 'day'),
  });

  const { data: breakdown = {}, isLoading: isBreakdownLoading } = useQuery({
    queryKey: ['analyticsBreakdown', timeRange],
    queryFn: () => analyticsApi.getBreakdown(timeRange),
  });

  const handleExportSummary = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Metric,Value\n' +
      `Time Range,${timeRange}\n` +
      `Total Requests,${overview?.total_requests || 0}\n` +
      `Successful Requests,${overview?.successful_requests || 0}\n` +
      `Failed Requests,${overview?.failed_requests || 0}\n` +
      `Success Rate,${overview?.success_rate || 100}%\n` +
      `Total Tokens,${overview?.total_tokens || 0}\n` +
      `Estimated Cost ($),${overview?.estimated_cost_usd || 0}\n` +
      `Avg Latency (ms),${overview?.avg_latency_ms || 0}\n` +
      `P50 Latency (ms),${overview?.p50_latency_ms || 0}\n` +
      `P95 Latency (ms),${overview?.p95_latency_ms || 0}\n` +
      `P99 Latency (ms),${overview?.p99_latency_ms || 0}\n` +
      `Failover Count,${overview?.failover_count || 0}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `axly_analytics_summary_${timeRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Analytics & Telemetry"
          description="In-depth aggregations across request volume, token throughput, latency percentiles, and provider reliability."
        />
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  timeRange === tr.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={handleExportSummary} className="h-9 gap-1.5">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Request Volume</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isOverviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold font-mono tracking-tight">
                  {(overview?.total_requests || 0).toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview?.success_rate ?? 100}% success rate
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Latency Percentiles</CardTitle>
            <Clock className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            {isOverviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold font-mono tracking-tight">
                  {overview?.avg_latency_ms ? `${Math.round(overview.avg_latency_ms)}ms` : '0ms'}
                </div>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  P50: {overview?.p50_latency_ms || 0}ms • P95: {overview?.p95_latency_ms || 0}ms
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Token Throughput</CardTitle>
            <Coins className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isOverviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold font-mono tracking-tight">
                  {(overview?.total_tokens || 0).toLocaleString()}
                </div>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  In: {(overview?.prompt_tokens || 0).toLocaleString()} • Out: {(overview?.completion_tokens || 0).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Failover Reliability</CardTitle>
            <Zap className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isOverviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold font-mono tracking-tight">
                  {overview?.failover_count || 0}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  automatic cross-provider recoveries
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: Volume & Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Request Volume & Status Distribution</CardTitle>
            <CardDescription className="text-xs">
              Throughput and error spikes over the selected timeframe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTimeseriesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : timeseries.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => (timeRange === '24h' ? v.split(' ')[1] : v.split('-').slice(1).join('/'))}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        fontSize: '12px',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="successful" name="Success" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="failed" name="Errors" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No telemetry recorded for this timeframe.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Latency Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Average Latency Response (ms)</CardTitle>
            <CardDescription className="text-xs">
              End-to-end response times across upstream provider round-trips.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTimeseriesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : timeseries.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => (timeRange === '24h' ? v.split(' ')[1] : v.split('-').slice(1).join('/'))}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        fontSize: '12px',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey="avg_latency_ms" name="Avg Latency (ms)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No latency points available.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Model Usage Popularity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Model Usage Breakdown</CardTitle>
            <CardDescription className="text-xs">
              Top models queried across client applications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isBreakdownLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : breakdown?.by_model && breakdown.by_model.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdown.by_model} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        fontSize: '12px',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="requests" name="Requests" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No model telemetry available.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 4: Error Categories Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Error Classifications</CardTitle>
            <CardDescription className="text-xs">
              Breakdown of upstream error categories that triggered failover or cooldowns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isBreakdownLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : breakdown?.by_error_category && breakdown.by_error_category.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdown.by_error_category} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        fontSize: '12px',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="count" name="Count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                Zero upstream errors recorded. All candidate attempts succeeded!
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
