import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Flame,
  Zap,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
} from 'lucide-react';

import { logsApi } from '../api/logs';
import { providersApi } from '../api/providers';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function RequestLogs() {
  const { addToast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [providerId, setProviderId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected Log Detail Modal
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Queries
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['requestLogs', page, pageSize, search, providerId, statusFilter],
    queryFn: () =>
      logsApi.listLogs({
        page,
        page_size: pageSize,
        search: search || undefined,
        provider_id: providerId || undefined,
        status_filter: statusFilter || undefined,
      }),
    refetchInterval: 15000,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  const { data: logDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['requestLogDetail', selectedRequestId],
    queryFn: () => logsApi.getLogDetail(selectedRequestId),
    enabled: !!selectedRequestId,
  });

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    addToast('Request ID copied to clipboard', 'info');
  };

  const handleExportCsv = () => {
    const url = logsApi.getExportCsvUrl({
      search,
      provider_id: providerId,
      status_filter: statusFilter,
    });
    window.open(url, '_blank');
  };

  const items = logsData?.items || [];
  const totalCount = logsData?.total_count || 0;
  const totalPages = logsData?.total_pages || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Request Logs"
          description="Auditable trace logs for every chat completion, candidate attempt, latency breakdown, and failover decision."
        />
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2 h-9">
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm text-xs">
        <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
          <Input
            placeholder="Search Request ID or model..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium text-muted-foreground">Provider:</span>
          <Select
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setPage(1);
            }}
            className="w-40 h-8 text-xs"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium text-muted-foreground">Status:</span>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-36 h-8 text-xs"
          >
            <option value="">All Statuses</option>
            <option value="success">Success (2xx)</option>
            <option value="error">Errors (4xx/5xx)</option>
          </Select>
        </div>

        <div className="ml-auto text-muted-foreground font-mono">
          {totalCount} total events
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-[11px] font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp (UTC)</th>
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Client Key</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Tokens</th>
                  <th className="px-4 py-3">Routing</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      No request logs found matching current filters.
                    </td>
                  </tr>
                ) : (
                  items.map((log) => {
                    const isSuccess = log.status_code >= 200 && log.status_code < 400;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedRequestId(log.request_id)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                          {log.request_id.slice(0, 14)}...
                        </td>
                        <td className="px-4 py-3 text-muted-foreground truncate max-w-[120px]">
                          {log.gateway_key_label || 'Direct'}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-foreground">
                          {log.model_identifier}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {log.provider_display_name || log.provider_name || 'auto'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={isSuccess ? 'success' : 'destructive'}
                            className="font-mono text-[10px]"
                          >
                            {log.status_code}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {Math.round(log.latency_ms)}ms
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {log.total_tokens ? log.total_tokens.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {log.has_fallback ? (
                            <Badge variant="warning" className="gap-1 text-[10px]">
                              <Zap className="h-3 w-3" />
                              <span>Failover ({log.attempt_count})</span>
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              1 Attempt
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <div>
              Page <span className="font-medium text-foreground">{page}</span> of{' '}
              <span className="font-medium text-foreground">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 gap-1"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Detail Modal */}
      <Dialog
        open={!!selectedRequestId}
        onClose={() => setSelectedRequestId(null)}
        title="Request Trace Details"
        description="Comprehensive execution metadata and candidate failover journey."
      >
        {isDetailLoading || !logDetail ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Header meta */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Request ID:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-foreground">
                  <span>{logDetail.log.request_id}</span>
                  <button
                    onClick={() => handleCopy(logDetail.log.request_id)}
                    className="p-1 hover:text-primary"
                    title="Copy ID"
                  >
                    {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                <div>
                  <span className="text-muted-foreground block text-[11px]">HTTP Status</span>
                  <span className="font-mono font-bold">{logDetail.log.status_code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Latency</span>
                  <span className="font-mono">{Math.round(logDetail.log.latency_ms)}ms</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Tokens (Prompt / Comp)</span>
                  <span className="font-mono">
                    {logDetail.log.prompt_tokens} / {logDetail.log.completion_tokens} (Total: {logDetail.log.total_tokens})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Est. Cost</span>
                  <span className="font-mono">${logDetail.log.estimated_cost_usd.toFixed(6)}</span>
                </div>
              </div>

              {logDetail.log.error_message && (
                <div className="pt-2 border-t">
                  <span className="text-destructive font-medium block text-[11px]">Error Message:</span>
                  <p className="font-mono text-destructive text-[11px] mt-0.5 break-all">
                    {logDetail.log.error_message}
                  </p>
                </div>
              )}
            </div>

            {/* Candidate Routing Journey */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Routing Attempt Journey ({logDetail.attempts.length} {logDetail.attempts.length === 1 ? 'attempt' : 'attempts'})
              </span>

              {logDetail.attempts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No attempt traces logged for this request.</p>
              ) : (
                <div className="space-y-2">
                  {logDetail.attempts.map((att, idx) => {
                    const isSuccess = att.result === 'success';
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border p-3 text-xs space-y-1.5 ${
                          isSuccess
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-destructive/30 bg-destructive/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={isSuccess ? 'success' : 'destructive'} className="text-[10px]">
                              Attempt #{att.attempt_number}
                            </Badge>
                            <span className="font-semibold text-foreground">
                              {att.provider_name} / {att.model_identifier}
                            </span>
                          </div>
                          <span className="font-mono text-muted-foreground">
                            {att.latency_ms ? `${Math.round(att.latency_ms)}ms` : ''}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-muted-foreground">
                          {att.credential_label && <span>Key: {att.credential_label}</span>}
                          {att.status_code && <span>HTTP {att.status_code}</span>}
                          {att.error_category && <span className="text-destructive">Category: {att.error_category}</span>}
                          {att.circuit_breaker_state && <span>Breaker: {att.circuit_breaker_state}</span>}
                        </div>

                        {att.error_message && (
                          <p className="text-[11px] text-destructive font-mono break-all">
                            {att.error_message}
                          </p>
                        )}

                        {att.cooldown_applied && (
                          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                            <Flame className="h-3 w-3" />
                            <span>Placed in cooldown for {att.cooldown_seconds}s</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setSelectedRequestId(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
