import React, { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  Flame,
  Edit,
  Trash2,
  Key,
  Layers,
} from 'lucide-react';

import { credentialsApi } from '../../api/credentials';
import { quotaGroupsApi } from '../../api/quotaGroups';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { StatusBadge } from '../ui/StatusBadge';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/Toast';

export function CredentialsPanel({ providers = [], providerFilter = '', onProviderFilterChange }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [healthFilter, setHealthFilter] = useState('all');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCred, setEditingCred] = useState(null);
  const [replacingSecretCred, setReplacingSecretCred] = useState(null);
  const [cooldownCred, setCooldownCred] = useState(null);
  const [deletingCred, setDeletingCred] = useState(null);

  // Form states
  const [formProviderId, setFormProviderId] = useState('');
  const [formQuotaGroupId, setFormQuotaGroupId] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formPriority, setFormPriority] = useState(1);
  const [formRpm, setFormRpm] = useState('');
  const [formTpm, setFormTpm] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const [newSecretKey, setNewSecretKey] = useState('');
  const [cooldownDuration, setCooldownDuration] = useState(60);
  const [cooldownReason, setCooldownReason] = useState('Manual maintenance cooldown');

  const { data: credentials = [], isLoading: isCredsLoading } = useQuery({
    queryKey: ['credentials', providerFilter],
    queryFn: () => credentialsApi.listCredentials(providerFilter || null),
    refetchInterval: 15000,
  });

  // Fetch detailed live health per credential (since CredentialResponse omits nested health)
  const healthQueries = useQueries({
    queries: credentials.map((c) => ({
      queryKey: ['credentialHealth', c.id],
      queryFn: () => credentialsApi.getCredentialHealth(c.id).catch(() => null),
      refetchInterval: 15000,
      staleTime: 8000,
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

  const { data: quotaGroups = [] } = useQuery({
    queryKey: ['quotaGroups'],
    queryFn: quotaGroupsApi.listQuotaGroups,
  });

  const invalidateAllCredQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['credentials'] });
    queryClient.invalidateQueries({ queryKey: ['credentialHealth'] });
    queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
  };

  const createMutation = useMutation({
    mutationFn: credentialsApi.createCredential,
    onSuccess: () => {
      invalidateAllCredQueries();
      toast.success('Credential encrypted with AES-256-GCM and stored');
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to add credential');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => credentialsApi.updateCredential(id, payload),
    onSuccess: () => {
      invalidateAllCredQueries();
      toast.success('Credential updated');
      setEditingCred(null);
      setReplacingSecretCred(null);
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update credential');
    },
  });

  const testMutation = useMutation({
    mutationFn: credentialsApi.testCredential,
    onSuccess: (data) => {
      invalidateAllCredQueries();
      if (data?.status === 'healthy' || data?.status === 'success') {
        toast.success(
          `Connectivity verified (${Math.round(data.latency_ms || 0)}ms) for ${data.label || data.provider}`
        );
      } else {
        toast.error(data?.error || 'Connectivity probe returned unhealthy status');
      }
    },
    onError: (err) => {
      invalidateAllCredQueries();
      toast.error(err.message || 'Connectivity verification failed');
    },
  });

  const cooldownMutation = useMutation({
    mutationFn: ({ id, duration, reason }) => credentialsApi.applyCooldown(id, duration, reason),
    onSuccess: () => {
      invalidateAllCredQueries();
      toast.warning('Manual cooldown applied');
      setCooldownCred(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to apply cooldown');
    },
  });

  const recoverMutation = useMutation({
    mutationFn: ({ id, validate }) => credentialsApi.recoverCredential(id, validate),
    onSuccess: () => {
      invalidateAllCredQueries();
      toast.success('Credential verified and restored to healthy status');
    },
    onError: (err) => {
      toast.error(err.message || 'Recovery rejected: upstream validation failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: credentialsApi.deleteCredential,
    onSuccess: () => {
      invalidateAllCredQueries();
      toast.success('Credential deleted permanently');
      setDeletingCred(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete credential');
    },
  });

  const resetForm = () => {
    setFormProviderId('');
    setFormQuotaGroupId('');
    setFormLabel('');
    setFormApiKey('');
    setFormPriority(1);
    setFormRpm('');
    setFormTpm('');
    setFormIsActive(true);
    setNewSecretKey('');
  };

  const handleOpenAdd = () => {
    resetForm();
    if (providers.length > 0) {
      setFormProviderId(providerFilter || providers[0].id);
    }
    setIsAddOpen(true);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      provider_id: formProviderId,
      quota_group_id: formQuotaGroupId || null,
      label: formLabel.trim(),
      api_key: formApiKey.trim(),
      priority: parseInt(formPriority, 10) || 1,
      rate_limit_rpm: formRpm ? parseInt(formRpm, 10) : null,
      rate_limit_tpm: formTpm ? parseInt(formTpm, 10) : null,
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingCred) return;
    updateMutation.mutate({
      id: editingCred.id,
      payload: {
        label: formLabel.trim(),
        quota_group_id: formQuotaGroupId || null,
        priority: parseInt(formPriority, 10) || 1,
        rate_limit_rpm: formRpm ? parseInt(formRpm, 10) : null,
        rate_limit_tpm: formTpm ? parseInt(formTpm, 10) : null,
        is_active: formIsActive,
      },
    });
  };

  const handleReplaceSecretSubmit = (e) => {
    e.preventDefault();
    if (!replacingSecretCred) return;
    updateMutation.mutate({
      id: replacingSecretCred.id,
      payload: { api_key: newSecretKey.trim() },
    });
  };

  const handleApplyCooldownSubmit = (e) => {
    e.preventDefault();
    if (!cooldownCred) return;
    cooldownMutation.mutate({
      id: cooldownCred.id,
      duration: parseInt(cooldownDuration, 10) || 60,
      reason: cooldownReason.trim(),
    });
  };

  const filteredCredentials = credentials.filter((c) => {
    const h = healthByCredId[c.id];
    const status = h?.status || (c.is_active ? 'healthy' : 'disabled');
    if (healthFilter === 'healthy' && status !== 'healthy') return false;
    if (healthFilter === 'cooldown' && !['rate_limited', 'temporarily_unavailable', 'in_cooldown', 'recovering'].includes(status)) {
      return false;
    }
    if (healthFilter === 'auth_error' && !['authentication_failure', 'permission_failure', 'error'].includes(status)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-card px-3.5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="cred-provider-filter" className="font-mono text-[11px] uppercase text-muted-foreground">
              Provider
            </label>
            <Select
              id="cred-provider-filter"
              value={providerFilter}
              onChange={(e) => onProviderFilterChange && onProviderFilterChange(e.target.value)}
              className="w-44 h-8"
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
            <label htmlFor="cred-health-filter" className="font-mono text-[11px] uppercase text-muted-foreground">
              Health
            </label>
            <Select
              id="cred-health-filter"
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              className="w-44 h-8"
            >
              <option value="all">All States</option>
              <option value="healthy">Healthy Only</option>
              <option value="cooldown">Cooldown / Rate Limited</option>
              <option value="auth_error">Auth / Key Errors</option>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {filteredCredentials.length} / {credentials.length} keys
          </span>
          <Button size="sm" onClick={handleOpenAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>Add Credential</span>
          </Button>
        </div>
      </div>

      {/* Credentials List */}
      {isCredsLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredCredentials.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No credentials found"
          description={
            providerFilter || healthFilter !== 'all'
              ? 'Adjust provider or health filters to view matching encrypted keys.'
              : 'Add your first AES-256-GCM encrypted upstream key for Gemini, Groq, or OpenAI.'
          }
          actionLabel="Add Credential"
          onAction={handleOpenAdd}
        />
      ) : (
        <div className="rounded border border-border bg-card divide-y divide-border overflow-hidden">
          {filteredCredentials.map((cred) => {
            const provider = providers.find((p) => p.id === cred.provider_id);
            const quotaGroup = quotaGroups.find((q) => q.id === cred.quota_group_id);
            const health = healthByCredId[cred.id];
            const status = !cred.is_active ? 'disabled' : health?.status || 'healthy';
            const isTesting = testMutation.isPending && testMutation.variables === cred.id;
            const isRecovering = recoverMutation.isPending && recoverMutation.variables?.id === cred.id;
            const hasActiveCooldown =
              health?.cooldown_until && new Date(health.cooldown_until) > new Date();

            return (
              <div
                key={cred.id}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 py-3.5 sm:px-5 hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                      #{cred.priority}
                    </span>
                    <span className="font-semibold text-sm text-foreground truncate">{cred.label}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {provider ? provider.display_name : 'Unknown'}
                    </Badge>
                    <StatusBadge status={status} />
                    {quotaGroup && (
                      <Badge variant="route" className="gap-1 font-mono text-[10px]">
                        <Layers className="h-3 w-3" />
                        <span>{quotaGroup.name}</span>
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-muted-foreground tabular-nums">
                    <code className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-foreground font-semibold">
                      {cred.key_preview}
                    </code>
                    {cred.rate_limit_rpm && <span>RPM {cred.rate_limit_rpm.toLocaleString()}</span>}
                    {cred.rate_limit_tpm && <span>TPM {cred.rate_limit_tpm.toLocaleString()}</span>}
                    <span>Req: {(cred.requests_count || 0).toLocaleString()}</span>
                    <span className={cred.errors_count > 0 ? 'text-status-err' : undefined}>
                      Err: {(cred.errors_count || 0).toLocaleString()}
                    </span>
                    {health?.response_time_ms !== null && health?.response_time_ms !== undefined && (
                      <span>Probe: {Math.round(health.response_time_ms)}ms</span>
                    )}
                    {hasActiveCooldown && (
                      <span className="text-status-warn font-sans font-medium inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Cooldown until {new Date(health.cooldown_until).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {health?.last_error_message && (
                    <p className="font-mono text-[11px] text-status-err break-all">
                      {health.last_error_code ? `[${health.last_error_code}] ` : ''}
                      {health.last_error_message}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isTesting}
                    onClick={() => testMutation.mutate(cred.id)}
                    className="h-8 gap-1.5"
                  >
                    <RefreshCw className={`h-3 w-3 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Probing...' : 'Test'}</span>
                  </Button>

                  {health && health.status !== 'healthy' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isRecovering}
                      onClick={() => recoverMutation.mutate({ id: cred.id, validate: true })}
                      className="h-8 gap-1 text-status-ok"
                      title="Verify upstream and clear error/cooldown state"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Recover</span>
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCooldownCred(cred)}
                    className="h-8 text-status-warn hover:text-status-warn gap-1"
                    title="Apply manual cooldown"
                  >
                    <Flame className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Cooldown</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    title="Rotate / replace API secret"
                    aria-label={`Replace secret for ${cred.label}`}
                    onClick={() => {
                      setReplacingSecretCred(cred);
                      setNewSecretKey('');
                    }}
                  >
                    <Key className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit credential settings"
                    aria-label={`Edit ${cred.label}`}
                    onClick={() => {
                      setEditingCred(cred);
                      setFormLabel(cred.label);
                      setFormQuotaGroupId(cred.quota_group_id || '');
                      setFormPriority(cred.priority);
                      setFormRpm(cred.rate_limit_rpm || '');
                      setFormTpm(cred.rate_limit_tpm || '');
                      setFormIsActive(cred.is_active);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete credential"
                    aria-label={`Delete ${cred.label}`}
                    onClick={() => setDeletingCred(cred)}
                    className="hover:text-status-err"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Credential Modal */}
      <Dialog
        open={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          resetForm();
        }}
        title="Add Provider Credential"
        description="API keys are encrypted at rest using AES-256-GCM and never returned in plaintext."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="add-cred-provider" className="text-xs font-medium text-foreground block">
              Provider <span className="text-status-err">*</span>
            </label>
            <Select
              id="add-cred-provider"
              value={formProviderId}
              onChange={(e) => setFormProviderId(e.target.value)}
              required
            >
              <option value="">Select provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.name})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="add-cred-label" className="text-xs font-medium text-foreground block">
              Label <span className="text-status-err">*</span>
            </label>
            <Input
              id="add-cred-label"
              placeholder="e.g. Groq Production Key 01"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="add-cred-secret" className="text-xs font-medium text-foreground block">
              API Key Secret <span className="text-status-err">*</span>
            </label>
            <Input
              id="add-cred-secret"
              type="password"
              placeholder="AIzaSy..., gsk_..., sk-proj-..."
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="add-cred-priority" className="text-xs font-medium text-foreground block">
                Priority Rank
              </label>
              <Input
                id="add-cred-priority"
                type="number"
                min={1}
                max={100}
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="add-cred-quota" className="text-xs font-medium text-foreground block">
                Quota Group
              </label>
              <Select
                id="add-cred-quota"
                value={formQuotaGroupId}
                onChange={(e) => setFormQuotaGroupId(e.target.value)}
              >
                <option value="">Independent Quota</option>
                {quotaGroups.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} ({q.scope_type})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="add-cred-rpm" className="text-xs font-medium text-foreground block">
                RPM Ceiling (Optional)
              </label>
              <Input
                id="add-cred-rpm"
                type="number"
                min={1}
                placeholder="e.g. 60"
                value={formRpm}
                onChange={(e) => setFormRpm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="add-cred-tpm" className="text-xs font-medium text-foreground block">
                TPM Ceiling (Optional)
              </label>
              <Input
                id="add-cred-tpm"
                type="number"
                min={1}
                placeholder="e.g. 100000"
                value={formTpm}
                onChange={(e) => setFormTpm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Encrypting...' : 'Save Credential'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Credential Modal */}
      <Dialog
        open={!!editingCred}
        onClose={() => setEditingCred(null)}
        title="Edit Credential"
        description="Update priority, rate limits, active flag, or quota group association."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-cred-label" className="text-xs font-medium text-foreground block">
              Label
            </label>
            <Input
              id="edit-cred-label"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-cred-priority" className="text-xs font-medium text-foreground block">
                Priority Rank
              </label>
              <Input
                id="edit-cred-priority"
                type="number"
                min={1}
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-cred-quota" className="text-xs font-medium text-foreground block">
                Quota Group
              </label>
              <Select
                id="edit-cred-quota"
                value={formQuotaGroupId}
                onChange={(e) => setFormQuotaGroupId(e.target.value)}
              >
                <option value="">Independent Quota</option>
                {quotaGroups.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} ({q.scope_type})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-cred-rpm" className="text-xs font-medium text-foreground block">
                RPM Ceiling
              </label>
              <Input
                id="edit-cred-rpm"
                type="number"
                min={1}
                placeholder="Unset"
                value={formRpm}
                onChange={(e) => setFormRpm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-cred-tpm" className="text-xs font-medium text-foreground block">
                TPM Ceiling
              </label>
              <Input
                id="edit-cred-tpm"
                type="number"
                min={1}
                placeholder="Unset"
                value={formTpm}
                onChange={(e) => setFormTpm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <span className="text-xs font-medium text-foreground">Credential Enabled</span>
              <p className="text-[11px] text-muted-foreground">
                Disabled keys are excluded from candidate selection.
              </p>
            </div>
            <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setEditingCred(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Replace Secret Modal */}
      <Dialog
        open={!!replacingSecretCred}
        onClose={() => setReplacingSecretCred(null)}
        title="Rotate Credential Secret"
        description={`Replace the encrypted upstream API key for '${replacingSecretCred?.label}'.`}
      >
        <form onSubmit={handleReplaceSecretSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="replace-cred-secret" className="text-xs font-medium text-foreground block">
              New API Key Secret <span className="text-status-err">*</span>
            </label>
            <Input
              id="replace-cred-secret"
              type="password"
              placeholder="Paste replacement key..."
              value={newSecretKey}
              onChange={(e) => setNewSecretKey(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setReplacingSecretCred(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !newSecretKey.trim()}>
              Encrypt &amp; Replace
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Manual Cooldown Modal */}
      <Dialog
        open={!!cooldownCred}
        onClose={() => setCooldownCred(null)}
        title="Apply Manual Cooldown"
        description={`Temporarily exclude '${cooldownCred?.label}' from candidate selection.`}
      >
        <form onSubmit={handleApplyCooldownSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cd-duration" className="text-xs font-medium text-foreground block">
              Duration (seconds)
            </label>
            <Input
              id="cd-duration"
              type="number"
              min={5}
              max={86400}
              value={cooldownDuration}
              onChange={(e) => setCooldownDuration(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cd-reason" className="text-xs font-medium text-foreground block">
              Reason
            </label>
            <Input
              id="cd-reason"
              value={cooldownReason}
              onChange={(e) => setCooldownReason(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setCooldownCred(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={cooldownMutation.isPending}>
              Apply Cooldown
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Modal */}
      <Dialog
        open={!!deletingCred}
        onClose={() => setDeletingCred(null)}
        title="Delete Credential?"
        description={`Permanently remove '${deletingCred?.label}'? Requests relying solely on this key will fall back to remaining credentials.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeletingCred(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deletingCred && deleteMutation.mutate(deletingCred.id)}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Credential'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
