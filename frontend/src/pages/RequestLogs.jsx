import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight,
  ListFilter,
} from 'lucide-react';
import { logsApi } from '../api/logs';
import { providersApi } from '../api/providers';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
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
import { formatDate, formatLatency, formatCurrency } from '../lib/utils';

export function RequestLogs() {
  const { addToast } = useToast();

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  const {
    data: logsData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['request-logs', page, pageSize, search, providerFilter, statusFilter],
    queryFn: () =>
      logsApi.listLogs({
        page,
        page_size: pageSize,
        search: search.trim() || undefined,
        provider_id: providerFilter || undefined,
        status_filter: statusFilter || undefined,
      }),
    keepPreviousData: true,
  });

  const { data: logDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['request-log-detail', selectedRequestId],
    queryFn: () => logsApi.getLogDetail(selectedRequestId),
    enabled: !!selectedRequestId,
  });

  const logs = logsData?.items || [];
  const totalCount = logsData?.total_count || 0;
  const totalPages = Math.max(1, logsData?.total_pages || 1);
  const hasFilters = Boolean(search || providerFilter || statusFilter);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await logsApi.exportCsv({
        search: search.trim() || undefined,
        provider_id: providerFilter || undefined,
        status_filter: statusFilter || undefined,
      });
      addToast('CSV log export downloaded', 'success');
    } catch (err) {
      addToast(err.message || 'CSV export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setProviderFilter('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Request Logs"
        description="Complete execution ledger of routed completions, multi-provider failover traces, token accounting, and upstream failure causes."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={isExporting || totalCount === 0}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="rounded border border-border bg-card p-3.5 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5 pointer-events-none" />
          <Input
            id="log-search"
            aria-label="Search logs by request ID, alias, model, or error"
            placeholder="Filter by request ID, alias, resolved model, or error..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Select
            aria-label="Filter by provider"
            value={providerFilter}
            onChange={(e) => {
              setProviderFilter(e.target.value);
              setPage(1);
            }}
            className="w-44 text-xs"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-36 text-xs"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}

          <span className="font-mono text-[11px] text-muted-foreground tabular-nums px-1">
            {totalCount.toLocaleString()} records
          </span>
        </div>
      </div>

      {/* Execution Table */}
      <div className="rounded border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ListFilter}
              title={hasFilters ? 'No matching logs found' : 'No request traffic recorded yet'}
              description={
                hasFilters
                  ? 'Try adjusting or clearing your search query, provider, or status filters.'
                  : 'Once client keys execute completions through /v1/chat/completions, request traces and routing hops will appear here.'
              }
              actionLabel={hasFilters ? 'Clear Filters' : undefined}
              onAction={hasFilters ? resetFilters : undefined}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Request ID</TableHead>
                <TableHead>Route / Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">Tokens / Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const resolvedDiffers =
                  log.resolved_model && log.resolved_model !== log.requested_model;
                return (
                  <TableRow
                    key={log.id || log.request_id}
                    tabIndex={0}
                    onClick={() => setSelectedRequestId(log.request_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedRequestId(log.request_id);
                      }
                    }}
                    className="cursor-pointer focus-visible:outline-none focus-visible:bg-muted/70"
                  >
                    <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium text-foreground max-w-[140px] truncate">
                      {log.request_id}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {log.requested_model}
                        </span>
                        {resolvedDiffers && (
                          <>
                            <ArrowRight className="h-3 w-3 text-route shrink-0" />
                            <span className="font-mono text-[11px] text-route truncate">
                              {log.resolved_model}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      {log.selected_provider || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs tabular-nums text-foreground">
                          {log.attempt_count ?? 1}
                        </span>
                        {log.failover_occurred && (
                          <Badge variant="warning" className="font-mono text-[10px]">
                            FAILOVER
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                      {formatLatency(log.latency_ms)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] tabular-nums">
                      <span className="text-foreground">
                        {(log.total_tokens || 0).toLocaleString()} tok
                      </span>
                      <span className="block text-muted-foreground">
                        {formatCurrency(log.estimated_cost_usd)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-subtle px-4 py-2.5">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Trace Inspector Dialog */}
      <Dialog
        open={!!selectedRequestId}
        onClose={() => setSelectedRequestId(null)}
        title="Execution & Failover Trace"
        description={selectedRequestId ? `Request ID: ${selectedRequestId}` : undefined}
        size="lg"
      >
        {isDetailLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : logDetail?.log ? (
          <div className="space-y-5">
            {/* Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border border-border rounded bg-surface-subtle divide-y sm:divide-y-0 sm:divide-x divide-border">
              <div className="px-3.5 py-2.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Outcome
                </span>
                <div className="mt-1">
                  <StatusBadge status={logDetail.log.status} />
                </div>
              </div>
              <div className="px-3.5 py-2.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Latency
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatLatency(logDetail.log.latency_ms)}
                </span>
              </div>
              <div className="px-3.5 py-2.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tokens
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold tabular-nums text-foreground">
                  {(logDetail.log.total_tokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="px-3.5 py-2.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Est. Cost
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(logDetail.log.estimated_cost_usd)}
                </span>
              </div>
            </div>

            {/* Metadata Grid */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs rounded border border-border p-3.5">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Requested Target
                </dt>
                <dd className="mt-0.5 font-mono text-foreground">{logDetail.log.requested_model}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Resolved Target
                </dt>
                <dd className="mt-0.5 font-mono text-route">
                  {logDetail.log.resolved_model || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Selected Provider
                </dt>
                <dd className="mt-0.5 font-mono uppercase text-foreground">
                  {logDetail.log.selected_provider || '—'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Timestamp
                </dt>
                <dd className="mt-0.5 font-mono text-foreground">
                  {formatDate(logDetail.log.created_at)}
                </dd>
              </div>
              {(logDetail.log.error_category || logDetail.log.error_message) && (
                <div className="sm:col-span-2 border-t border-border pt-2.5">
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-status-err">
                    Terminal Error ({logDetail.log.error_category || 'error'})
                  </dt>
                  <dd className="mt-1 font-mono text-xs text-status-err break-words">
                    {logDetail.log.error_message}
                  </dd>
                </div>
              )}
            </dl>

            {/* Vertical Attempt Timeline */}
            <div>
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Routing Attempt Timeline ({(logDetail.attempts || []).length} hops)
              </h3>
              {(logDetail.attempts || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No granular attempt records attached to this log entry.
                </p>
              ) : (
                <ol className="relative border-l border-border ml-3 space-y-4">
                  {logDetail.attempts.map((attempt, idx) => (
                    <li key={attempt.id || idx} className="pl-5 relative">
                      <span
                        className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[9px] font-bold ${
                          attempt.status === 'success'
                            ? 'border-status-ok bg-card text-status-ok'
                            : 'border-status-err bg-card text-status-err'
                        }`}
                      >
                        {attempt.attempt_number || idx + 1}
                      </span>
                      <div className="rounded border border-border bg-card p-3 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="font-semibold uppercase text-foreground">
                              {attempt.provider_name || 'provider'}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-route">{attempt.model_identifier}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {formatLatency(attempt.latency_ms)}
                            </span>
                            <StatusBadge status={attempt.status} />
                          </div>
                        </div>
                        {attempt.credential_label && (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            Credential: {attempt.credential_label}
                          </div>
                        )}
                        {attempt.error_message && (
                          <div className="font-mono text-[11px] text-status-err bg-status-err/10 rounded px-2 py-1 mt-1">
                            {attempt.error_category ? `[${attempt.error_category}] ` : ''}
                            {attempt.error_message}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unable to retrieve trace details.</p>
        )}
      </Dialog>
    </div>
  );
}

export default RequestLogs;
