import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  Activity,
  Flame,
  RotateCcw,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  Layers,
  History,
  Lock,
  ArrowRight,
} from 'lucide-react';

import { routingApi } from '../api/routing';
import { circuitBreakersApi } from '../api/circuitBreakers';
import { quotaGroupsApi } from '../api/quotaGroups';
import { credentialsApi } from '../api/credentials';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function FallbackRecovery() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('circuit_breakers');
  const [selectedBreaker, setSelectedBreaker] = useState(null);
  const [manualCooldownCred, setManualCooldownCred] = useState(null);
  const [cooldownDuration, setCooldownDuration] = useState(60);
  const [cooldownReason, setCooldownReason] = useState('Administrator maintenance exclusion');

  // Queries
  const { data: healthOverview = {}, isLoading: isHealthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['routingHealthOverview'],
    queryFn: routingApi.getRoutingHealth,
    refetchInterval: 10000,
  });

  const { data: circuitBreakers = [], isLoading: isCBLoading } = useQuery({
    queryKey: ['circuitBreakers'],
    queryFn: circuitBreakersApi.listCircuitBreakers,
    refetchInterval: 10000,
  });

  const { data: quotaGroups = [], isLoading: isQGLoading } = useQuery({
    queryKey: ['quotaGroups'],
    queryFn: quotaGroupsApi.listQuotaGroups,
    refetchInterval: 10000,
  });

  const { data: credentials = [], isLoading: isCredsLoading } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => credentialsApi.listCredentials(),
    refetchInterval: 10000,
  });

  // Mutations
  const resetCBMutation = useMutation({
    mutationFn: circuitBreakersApi.resetCircuitBreaker,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circuitBreakers'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      addToast('Circuit breaker manually reset to CLOSED', 'success');
      setSelectedBreaker(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to reset circuit breaker', 'error');
    },
  });

  const resetQGMutation = useMutation({
    mutationFn: quotaGroupsApi.resetQuotaGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotaGroups'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      addToast('Quota group cooldown cleared and status reset to healthy', 'success');
    },
    onError: (err) => {
      addToast(err.message || 'Failed to reset quota group', 'error');
    },
  });

  const applyCooldownMutation = useMutation({
    mutationFn: ({ id, duration, reason }) =>
      credentialsApi.applyCooldown(id, duration, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      addToast('Manual cooldown applied to credential', 'warning');
      setManualCooldownCred(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to apply cooldown', 'error');
    },
  });

  const recoverCredMutation = useMutation({
    mutationFn: ({ id, validate }) => credentialsApi.recoverCredential(id, validate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      addToast('Credential verified and restored to healthy status', 'success');
    },
    onError: (err) => {
      addToast(err.message || 'Recovery failed: Upstream validation rejected API key', 'error');
    },
  });

  const isRefreshing = isHealthLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Fallback & Recovery"
          description="Resilience command center: circuit breakers, shared quota cooldowns, and credential recovery."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries();
            addToast('Health state refreshed', 'info');
          }}
          disabled={isRefreshing}
          className="h-9 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh States</span>
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Circuit Breakers</CardTitle>
            <Zap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {circuitBreakers.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {circuitBreakers.filter((cb) => cb.state === 'OPEN').length} OPEN •{' '}
              {circuitBreakers.filter((cb) => cb.state === 'HALF_OPEN').length} HALF-OPEN
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Quota Groups</CardTitle>
            <Layers className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {quotaGroups.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {quotaGroups.filter((q) => q.status !== 'healthy').length} in cooldown / exhausted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Healthy Credentials</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {credentials.filter((c) => c.health?.status === 'healthy').length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              of {credentials.length} configured credentials
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Cooldowns</CardTitle>
            <Flame className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {credentials.filter((c) => ['rate_limited', 'temporarily_unavailable', 'in_cooldown'].includes(c.health?.status)).length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {credentials.filter((c) => c.health?.status === 'authentication_failure').length} auth lockouts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="circuit_breakers" className="gap-2">
            <Zap className="h-3.5 w-3.5" />
            <span>Circuit Breakers</span>
          </TabsTrigger>
          <TabsTrigger value="quota_groups" className="gap-2">
            <Layers className="h-3.5 w-3.5" />
            <span>Quota Groups</span>
          </TabsTrigger>
          <TabsTrigger value="cooldowns" className="gap-2">
            <Flame className="h-3.5 w-3.5" />
            <span>Credential Cooldowns</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CIRCUIT BREAKERS */}
        <TabsContent value="circuit_breakers" className="space-y-4">
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Scope ID</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Failures</th>
                    <th className="px-4 py-3">Threshold</th>
                    <th className="px-4 py-3">Recovery Timeout</th>
                    <th className="px-4 py-3">Last Failure Reason</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isCBLoading ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ) : circuitBreakers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No circuit breakers initialized yet. Breakers are automatically created upon initial provider traffic.
                      </td>
                    </tr>
                  ) : (
                    circuitBreakers.map((cb) => (
                      <tr key={cb.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium capitalize">
                          {cb.scope_type}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-foreground">
                          {cb.scope_id}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={cb.state} />
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {cb.current_failures}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {cb.failure_threshold}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {cb.recovery_timeout_seconds}s
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-muted-foreground" title={cb.last_error_reason || 'None'}>
                          {cb.last_error_reason || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {cb.history && cb.history.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBreaker(cb)}
                                className="h-7 text-[11px] gap-1"
                              >
                                <History className="h-3 w-3" />
                                <span>History</span>
                              </Button>
                            )}
                            {cb.state !== 'CLOSED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resetCBMutation.mutate(cb.id)}
                                disabled={resetCBMutation.isPending}
                                className="h-7 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Reset</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: QUOTA GROUPS */}
        <TabsContent value="quota_groups" className="space-y-4">
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Group Name</th>
                    <th className="px-4 py-3">Scope Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Consecutive Failures</th>
                    <th className="px-4 py-3">Cooldown Until</th>
                    <th className="px-4 py-3">Last Quota Error</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isQGLoading ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ) : quotaGroups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No shared quota groups configured.
                      </td>
                    </tr>
                  ) : (
                    quotaGroups.map((qg) => (
                      <tr key={qg.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {qg.name}
                        </td>
                        <td className="px-4 py-3 font-mono uppercase text-muted-foreground">
                          {qg.scope_type}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={qg.status} />
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {qg.consecutive_failures}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {qg.cooldown_until
                            ? new Date(qg.cooldown_until).toLocaleTimeString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                          {qg.last_error_category || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {qg.status !== 'healthy' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resetQGMutation.mutate(qg.id)}
                              disabled={resetQGMutation.isPending}
                              className="h-7 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Clear Cooldown</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: CREDENTIAL COOLDOWNS */}
        <TabsContent value="cooldowns" className="space-y-4">
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Credential Label</th>
                    <th className="px-4 py-3">Key Preview</th>
                    <th className="px-4 py-3">Health Status</th>
                    <th className="px-4 py-3">Failures</th>
                    <th className="px-4 py-3">Cooldown Remaining</th>
                    <th className="px-4 py-3">Last Error Category</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isCredsLoading ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ) : credentials.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No credentials registered.
                      </td>
                    </tr>
                  ) : (
                    credentials.map((cred) => {
                      const health = cred.health;
                      const hasCooldown =
                        health?.cooldown_until &&
                        new Date(health.cooldown_until) > new Date();

                      return (
                        <tr key={cred.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {cred.label}
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {cred.key_preview || '••••••••'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={health?.status || (cred.is_active ? 'healthy' : 'disabled')} />
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {health?.consecutive_failures || 0}
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {hasCooldown ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                Until {new Date(health.cooldown_until).toLocaleTimeString()}
                              </span>
                            ) : (
                              'None'
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {health?.last_error_category || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {health && health.status !== 'healthy' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => recoverCredMutation.mutate({ id: cred.id, validate: true })}
                                  disabled={recoverCredMutation.isPending}
                                  className="h-7 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400"
                                  title="Test & Recover"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Recover</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setManualCooldownCred(cred)}
                                  className="h-7 text-[11px] gap-1 text-amber-600 hover:text-amber-700"
                                >
                                  <Flame className="h-3 w-3" />
                                  <span>Cooldown</span>
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Circuit Breaker History Modal */}
      <Dialog
        open={!!selectedBreaker}
        onClose={() => setSelectedBreaker(null)}
        title={`Circuit Breaker History: ${selectedBreaker?.scope_id}`}
        description="Historical state transitions and trigger events recorded by the distributed breaker."
      >
        <div className="space-y-3 mt-3 max-h-80 overflow-y-auto pr-1">
          {selectedBreaker?.history && selectedBreaker.history.length > 0 ? (
            selectedBreaker.history.map((h, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground">{h.from}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-bold text-primary">{h.to}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                {h.reason && <p className="text-muted-foreground text-[11px]">{h.reason}</p>}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No transition history recorded.</p>
          )}
        </div>
        <div className="flex justify-end pt-3 border-t mt-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedBreaker(null)}>
            Close
          </Button>
        </div>
      </Dialog>

      {/* Manual Cooldown Modal */}
      <Dialog
        open={!!manualCooldownCred}
        onClose={() => setManualCooldownCred(null)}
        title="Apply Manual Cooldown"
        description={`Set custom cooldown duration for '${manualCooldownCred?.label}'.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualCooldownCred) return;
            applyCooldownMutation.mutate({
              id: manualCooldownCred.id,
              duration: parseInt(cooldownDuration, 10) || 60,
              reason: cooldownReason.trim(),
            });
          }}
          className="space-y-4 mt-2"
        >
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Duration (seconds)</label>
            <Input
              type="number"
              min="5"
              max="3600"
              value={cooldownDuration}
              onChange={(e) => setCooldownDuration(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Reason</label>
            <Input
              value={cooldownReason}
              onChange={(e) => setCooldownReason(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setManualCooldownCred(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={applyCooldownMutation.isPending}>
              Apply Cooldown
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
