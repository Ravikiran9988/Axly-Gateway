import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Layers,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
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
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'All Time', value: 'all' },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export function Overview() {
  const [timeRange, setTimeRange] = useState('24h');

  const {
    data: overview,
    isLoading: isOverviewLoading,
    refetch: refetchOverview,
    isRefetching: isOverviewRefetching,
  } = useQuery({
    queryKey: ['analyticsOverview', timeRange],
    queryFn: () => analyticsApi.getOverview(timeRange),
    refetchInterval: 30000,
  });

  const {
    data: timeseries,
    isLoading: isTimeseriesLoading,
    refetch: refetchTimeseries,
  } = useQuery({
    queryKey: ['analyticsTimeseries', timeRange],
    queryFn: () => analyticsApi.getTimeseries(timeRange, timeRange === '24h' ? 'hour' : 'day'),
    refetchInterval: 30000,
  });

  const {
    data: breakdown,
    isLoading: isBreakdownLoading,
    refetch: refetchBreakdown,
  } = useQuery({
    queryKey: ['analyticsBreakdown', timeRange],
    queryFn: () => analyticsApi.getBreakdown(timeRange),
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    refetchOverview();
    refetchTimeseries();
    refetchBreakdown();
  };

  const isRefreshing = isOverviewRefetching;
  const isLoading = isOverviewLoading || isTimeseriesLoading || isBreakdownLoading;

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Overview"
          description="Real-time operational metrics, request volume, token throughput, and failover health."
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

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Requests</CardTitle>
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
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {(overview?.successful_requests || 0).toLocaleString()} ok
                  </span>
                  <span>•</span>
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {(overview?.failed_requests || 0).toLocaleString()} err
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isOverviewLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold font-mono tracking-tight">
                  {overview?.success_rate ?? 100}%
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview?.failover_count || 0} failover events recovered
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Tokens & Cost */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Tokens & Est. Cost</CardTitle>
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
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                  <span>Est. ${overview?.estimated_cost_usd?.toFixed(4) || '0.0000'}</span>
                  <span className="text-[10px] text-muted-foreground/80">(catalog rates)</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latency & Providers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Latency & Health</CardTitle>
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
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{overview?.active_providers || 0} providers</span>
                  <span>•</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {overview?.healthy_credentials || 0} keys ok
                  </span>
                  {overview?.cooldown_credentials > 0 && (
                    <span className="text-amber-600 font-medium">
                      ({overview.cooldown_credentials} in cooldown)
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding State if no requests yet */}
      {!isOverviewLoading && overview?.total_requests === 0 && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-8 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Zap className="h-8 w-8" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-base font-semibold text-foreground">Welcome to AXLY Gateway!</h3>
                <p className="text-sm text-muted-foreground">
                  No requests recorded in this time window yet. Send your first OpenAI-compatible chat completion
                  request using any configured alias (such as <code className="font-mono text-primary font-bold">fast</code> or <code className="font-mono text-primary font-bold">smart</code>):
                </p>
                <div className="mt-3 rounded-lg bg-card p-3 border font-mono text-xs overflow-x-auto text-left">
                  <pre className="text-muted-foreground">
{`curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_GATEWAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "fast", "messages": [{"role": "user", "content": "Hello AXLY Gateway!"}]}'`}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart 1: Request Volume Over Time (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Request Volume & Outcome</span>
              <Badge variant="outline" className="font-normal text-[11px]">
                {timeRange}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Throughput split between successful (2xx) and rejected/failed requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTimeseriesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : timeseries && timeseries.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.split(' ')[1] || v}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        fontSize: '12px',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area
                      type="monotone"
                      dataKey="successful"
                      name="Successful"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorSuccess)"
                    />
                    <Area
                      type="monotone"
                      dataKey="failed"
                      name="Failed"
                      stroke="#ef4444"
                      fillOpacity={1}
                      fill="url(#colorFailed)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No activity recorded in this time range.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Provider Request Distribution (1 col) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Provider Distribution</CardTitle>
            <CardDescription className="text-xs">
              Proportion of requests resolved by provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isBreakdownLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : breakdown?.by_provider && breakdown.by_provider.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown.by_provider}
                      dataKey="requests"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {breakdown.by_provider.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        fontSize: '12px',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No provider traffic recorded yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Token Consumption Over Time (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Token Consumption</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription className="text-xs">
              Total prompt and completion tokens routed through gateway adapters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTimeseriesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : timeseries && timeseries.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeseries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.split(' ')[1] || v}
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
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="tokens" name="Total Tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No token data available.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 4: Latency & Failover Activity (1 col) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Latency Trends (ms)</span>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription className="text-xs">
              Average upstream response latency over time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTimeseriesLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : timeseries && timeseries.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.split(' ')[1] || v}
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
                    <Line
                      type="monotone"
                      dataKey="avg_latency_ms"
                      name="Avg Latency (ms)"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                No latency records.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
