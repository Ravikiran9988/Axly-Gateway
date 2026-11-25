import React, { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap,
  Layers,
  Flame,
  RotateCcw,
  History,
  ArrowRight,
  Plus,
} from 'lucide-react';

import { circuitBreakersApi } from '../../api/circuitBreakers';
import { quotaGroupsApi } from '../../api/quotaGroups';
import { credentialsApi } from '../../api/credentials';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { useToast } from '../ui/Toast';

export function FallbackRecoveryPanel({ providers = [] }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [subTab, setSubTab] = useState('circuit_breakers');
  const [selectedBreaker, setSelectedBreaker] = useState(null);
  const [manualCooldownCred, setManualCooldownCred] = useState(null);
  const [cooldownDuration, setCooldownDuration] = useState(60);
  const [cooldownReason, setCooldownReason] = useState('Administrator maintenance exclusion');

  const [isAddQuotaOpen, setIsAddQuotaOpen] = useState(false);
  const [qgName, setQgName] = useState('');
  const [qgScopeType, setQgScopeType] = useState('project');
  const [qgProviderId, setQgProviderId] = useState('');
  const [qgDesc, setQgDesc] = useState('');

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
    queryKey: ['credentials', null],
    queryFn: () => credentialsApi.listCredentials(null),
    refetchInterval: 10000,
  });

  const healthQueries = useQueries({
    queries: credentials.map((c) => ({
      queryKey: ['credentialHealth', c.id],
      queryFn: () => credentialsApi.getCredentialHealth(c.id).catch(() => null),
      refetchInterval: 10000,
      staleTime: 6000,
    })),
  });

  const healthByCredId = useMemo(() => {
    const map = {};
    credentials.forEach((c, idx) => {
      if (healthQueries[idx]?.data) {
        map[c.id] = healthQueries[idx].data;
      }
    });
    return map;
  }, [credentials, healthQueries]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['circuitBreakers'] });
    queryClient.invalidateQueries({ queryKey: ['quotaGroups'] });
    queryClient.invalidateQueries({ queryKey: ['credentials'] });
    queryClient.invalidateQueries({ queryKey: ['credentialHealth'] });
    queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
  };

  const resetCBMutation = useMutation({
    mutationFn: circuitBreakersApi.resetCircuitBreaker,
    onSuccess: () => {
      invalidateAll();
      toast.success('Circuit breaker manually reset to CLOSED');
      setSelectedBreaker(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to reset circuit breaker'),
  });

  const createQGMutation = useMutation({
    mutationFn: quotaGroupsApi.createQuotaGroup,
    onSuccess: () => {
      invalidateAll();
      toast.success('Quota group created');
      setIsAddQuotaOpen(false);
      setQgName('');
      setQgDesc('');
    },
    onError: (err) => toast.error(err.message || 'Failed to create quota group'),
  });

  const resetQGMutation = useMutation({
    mutationFn: quotaGroupsApi.resetQuotaGroup,
    onSuccess: () => {
      invalidateAll();
      toast.success('Quota group cooldown cleared');
    },
    onError: (err) => toast.error(err.message || 'Failed to clear quota group'),
  });

  const applyCooldownMutation = useMutation({
    mutationFn: ({ id, duration, reason }) => credentialsApi.applyCooldown(id, duration, reason),
    onSuccess: () => {
      invalidateAll();
      toast.warning('Manual cooldown applied');
      setManualCooldownCred(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to apply cooldown'),
  });

  const recoverCredMutation = useMutation({
    mutationFn: ({ id, validate }) => credentialsApi.recoverCredential(id, validate),
    onSuccess: () => {
      invalidateAll();
      toast.success('Credential validated and restored to healthy status');
    },
    onError: (err) => toast.error(err.message || 'Recovery failed: upstream validation rejected key'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={subTab} onValueChange={setSubTab} variant="segmented">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="circuit_breakers" className="gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                <span>Circuit Breakers ({circuitBreakers.length})</span>
              </TabsTrigger>
              <TabsTrigger value="quota_groups" className="gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                <span>Quota Groups ({quotaGroups.length})</span>
              </TabsTrigger>
              <TabsTrigger value="cooldowns" className="gap-1.5">
                <Flame className="h-3.5 w-3.5" />
                <span>Credential Cooldowns ({credentials.length})</span>
              </TabsTrigger>
            </TabsList>

            {subTab === 'quota_groups' && (
              <Button size="sm" onClick={() => setIsAddQuotaOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                <span>New Quota Group</span>
              </Button>
            )}
          </div>

          <TabsContent value="circuit_breakers">
            <div className="rounded border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Failures / Threshold</TableHead>
                    <TableHead className="text-right">Recovery</TableHead>
                    <TableHead>Last Failure Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isCBLoading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : circuitBreakers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No circuit breakers initialized yet. Breakers initialize automatically on first traffic.
                      </TableCell>
                    </TableRow>
                  ) : (
                    circuitBreakers.map((cb) => (
                      <TableRow key={cb.id}>
                        <TableCell className="font-mono uppercase text-muted-foreground">
                          {cb.scope_type}
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-foreground">
                          {cb.scope_id}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={cb.state} />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {cb.current_failures} / {cb.failure_threshold}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {cb.recovery_timeout_seconds}s
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground" title={cb.last_error_reason || ''}>
                          {cb.last_error_reason || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {cb.history && cb.history.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBreaker(cb)}
                                className="h-7 gap-1"
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
                                className="h-7 gap-1 text-status-ok"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Reset</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="quota_groups">
            <div className="rounded border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead>Cooldown Until</TableHead>
                    <TableHead>Last Category</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isQGLoading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : quotaGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No shared quota groups configured. Create one to cascade cooldowns across shared billing keys.
                      </TableCell>
                    </TableRow>
                  ) : (
                    quotaGroups.map((qg) => (
                      <TableRow key={qg.id}>
                        <TableCell className="font-semibold text-foreground">{qg.name}</TableCell>
                        <TableCell className="font-mono uppercase text-muted-foreground">{qg.scope_type}</TableCell>
                        <TableCell>
                          <StatusBadge status={qg.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {qg.consecutive_failures}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {qg.cooldown_until ? new Date(qg.cooldown_until).toLocaleTimeString() : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {qg.last_error_category || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {qg.status !== 'healthy' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resetQGMutation.mutate(qg.id)}
                              disabled={resetQGMutation.isPending}
                              className="h-7 gap-1 text-status-ok"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Clear Cooldown</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="cooldowns">
            <div className="rounded border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Credential</TableHead>
                    <TableHead>Key Prefix</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead>Cooldown Until</TableHead>
                    <TableHead>Last Category</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isCredsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ) : credentials.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No credentials registered.
                      </TableCell>
                    </TableRow>
                  ) : (
                    credentials.map((cred) => {
                      const health = healthByCredId[cred.id];
                      const status = !cred.is_active ? 'disabled' : health?.status || 'healthy';
                      const hasCooldown =
                        health?.cooldown_until && new Date(health.cooldown_until) > new Date();

                      return (
                        <TableRow key={cred.id}>
                          <TableCell className="font-semibold text-foreground">{cred.label}</TableCell>
                          <TableCell>
                            <code className="font-mono text-[11px] text-muted-foreground">
                              {cred.key_preview}
                            </code>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={status} />
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {health?.consecutive_failures || 0}
                          </TableCell>
                          <TableCell className="font-mono">
                            {hasCooldown ? (
                              <span className="text-status-warn">
                                {new Date(health.cooldown_until).toLocaleTimeString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {health?.last_error_category || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {health && health.status !== 'healthy' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => recoverCredMutation.mutate({ id: cred.id, validate: true })}
                                disabled={recoverCredMutation.isPending}
                                className="h-7 gap-1 text-status-ok"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Recover</span>
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setManualCooldownCred(cred)}
                                className="h-7 gap-1 text-status-warn hover:text-status-warn"
                              >
                                <Flame className="h-3 w-3" />
                                <span>Cooldown</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Circuit Breaker History Dialog */}
      <Dialog
        open={!!selectedBreaker}
        onClose={() => setSelectedBreaker(null)}
        title={`Circuit Breaker History: ${selectedBreaker?.scope_id}`}
        description="State transitions recorded across failure bursts and half-open recovery probes."
      >
        <div className="space-y-2.5 max-h-80 overflow-y-auto">
          {selectedBreaker?.history?.length > 0 ? (
            selectedBreaker.history.map((h, i) => (
              <div key={i} className="rounded border border-border bg-background p-3 text-xs space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{h.from}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold text-route">{h.to}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                {h.reason && <p className="text-[11px] text-muted-foreground">{h.reason}</p>}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No transition history recorded.</p>
          )}
        </div>
        <div className="flex justify-end pt-3 border-t border-border mt-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedBreaker(null)}>
            Close
          </Button>
        </div>
      </Dialog>

      {/* Manual Cooldown Dialog */}
      <Dialog
        open={!!manualCooldownCred}
        onClose={() => setManualCooldownCred(null)}
        title="Apply Manual Cooldown"
        description={`Set exclusion duration for '${manualCooldownCred?.label}'.`}
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
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="fr-cd-dur" className="text-xs font-medium text-foreground block">
              Duration (seconds)
            </label>
            <Input
              id="fr-cd-dur"
              type="number"
              min={5}
              max={86400}
              value={cooldownDuration}
              onChange={(e) => setCooldownDuration(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fr-cd-reason" className="text-xs font-medium text-foreground block">
              Reason
            </label>
            <Input
              id="fr-cd-reason"
              value={cooldownReason}
              onChange={(e) => setCooldownReason(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setManualCooldownCred(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={applyCooldownMutation.isPending}>
              Apply Cooldown
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Create Quota Group Dialog */}
      <Dialog
        open={isAddQuotaOpen}
        onClose={() => setIsAddQuotaOpen(false)}
        title="Create Quota Group"
        description="Link sibling API credentials sharing a single upstream billing project or organization quota."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createQGMutation.mutate({
              name: qgName.trim(),
              scope_type: qgScopeType,
              provider_id: qgProviderId || null,
              description: qgDesc.trim() || null,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="qg-name" className="text-xs font-medium text-foreground block">
              Group Name <span className="text-status-err">*</span>
            </label>
            <Input
              id="qg-name"
              placeholder="e.g. Google Workspace Billing Pool"
              value={qgName}
              onChange={(e) => setQgName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="qg-scope" className="text-xs font-medium text-foreground block">
                Quota Scope
              </label>
              <Select id="qg-scope" value={qgScopeType} onChange={(e) => setQgScopeType(e.target.value)}>
                <option value="project">Project</option>
                <option value="organization">Organization</option>
                <option value="provider">Provider</option>
                <option value="model_family">Model Family</option>
                <option value="credential">Credential</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qg-prov" className="text-xs font-medium text-foreground block">
                Provider (Optional)
              </label>
              <Select id="qg-prov" value={qgProviderId} onChange={(e) => setQgProviderId(e.target.value)}>
                <option value="">Any Provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="qg-desc" className="text-xs font-medium text-foreground block">
              Description (Optional)
            </label>
            <Input
              id="qg-desc"
              placeholder="Shared TPM/RPM quota across billing project keys"
              value={qgDesc}
              onChange={(e) => setQgDesc(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddQuotaOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createQGMutation.isPending || !qgName.trim()}>
              {createQGMutation.isPending ? 'Creating...' : 'Create Group'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
