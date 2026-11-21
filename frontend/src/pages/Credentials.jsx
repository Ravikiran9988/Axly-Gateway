import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Flame,
  Play,
  Edit,
  Trash2,
  Key,
  Layers,
  ArrowUpDown,
} from 'lucide-react';

import { credentialsApi } from '../api/credentials';
import { providersApi } from '../api/providers';
import { quotaGroupsApi } from '../api/quotaGroups';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function Credentials() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const providerFilter = searchParams.get('provider') || '';
  const [healthFilter, setHealthFilter] = useState('all');

  // Modals state
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

  // Replace secret form
  const [newSecretKey, setNewSecretKey] = useState('');

  // Cooldown form
  const [cooldownDuration, setCooldownDuration] = useState(60);
  const [cooldownReason, setCooldownReason] = useState('Manual maintenance cooldown');

  // Queries
  const { data: credentials = [], isLoading: isCredsLoading } = useQuery({
    queryKey: ['credentials', providerFilter],
    queryFn: () => credentialsApi.listCredentials(providerFilter || null),
    refetchInterval: 15000,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  const { data: quotaGroups = [] } = useQuery({
    queryKey: ['quotaGroups'],
    queryFn: quotaGroupsApi.listQuotaGroups,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: credentialsApi.createCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      addToast('Credential encrypted and added successfully', 'success');
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to add credential', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => credentialsApi.updateCredential(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      addToast('Credential updated successfully', 'success');
      setEditingCred(null);
      setReplacingSecretCred(null);
      resetForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to update credential', 'error');
    },
  });

  const testMutation = useMutation({
    mutationFn: credentialsApi.testCredential,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      if (data.status === 'success') {
        addToast(
          `Connectivity verified (${Math.round(data.latency_ms || 0)}ms): ${data.message || 'Key operational'}`,
          'success'
        );
      } else {
        addToast(`Test failed: ${data.error || 'Authentication rejected by upstream'}`, 'error');
      }
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      addToast(`Connectivity test failed: ${err.message}`, 'error');
    },
  });

  const cooldownMutation = useMutation({
    mutationFn: ({ id, duration, reason }) =>
      credentialsApi.applyCooldown(id, duration, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      addToast('Manual cooldown applied', 'warning');
      setCooldownCred(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to apply cooldown', 'error');
    },
  });

  const recoverMutation = useMutation({
    mutationFn: ({ id, validate }) => credentialsApi.recoverCredential(id, validate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      addToast('Credential recovered to healthy status', 'success');
    },
    onError: (err) => {
      addToast(err.message || 'Recovery rejected: upstream key validation failed', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: credentialsApi.deleteCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      addToast('Credential deleted permanently', 'success');
      setDeletingCred(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to delete credential', 'error');
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
      },
    });
  };

  const handleReplaceSecretSubmit = (e) => {
    e.preventDefault();
    if (!replacingSecretCred) return;
    updateMutation.mutate({
      id: replacingSecretCred.id,
      payload: {
        api_key: newSecretKey.trim(),
      },
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

  // Filtered credentials
  const filteredCredentials = credentials.filter((c) => {
    if (healthFilter !== 'all') {
      const status = c.health?.status || 'unknown';
      if (healthFilter === 'healthy' && status !== 'healthy') return false;
      if (healthFilter === 'cooldown' && !['rate_limited', 'temporarily_unavailable', 'in_cooldown'].includes(status)) return false;
      if (healthFilter === 'auth_error' && status !== 'authentication_failure') return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Credentials"
          description="Manage encrypted provider API keys, priority rankings, quota groups, and cooldown recovery."
        />
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>Add Credential</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-muted-foreground">Provider:</span>
          <Select
            value={providerFilter}
            onChange={(e) => {
              if (e.target.value) {
                setSearchParams({ provider: e.target.value });
              } else {
                setSearchParams({});
              }
            }}
            className="w-44 h-8 text-xs"
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
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="w-40 h-8 text-xs"
          >
            <option value="all">All States</option>
            <option value="healthy">Healthy Only</option>
            <option value="cooldown">In Cooldown / Rate-Limited</option>
            <option value="auth_error">Auth Failure</option>
          </Select>
        </div>

        <div className="ml-auto text-muted-foreground font-mono">
          Showing {filteredCredentials.length} of {credentials.length} credentials
        </div>
      </div>

      {/* Credentials Table / Grid */}
      {isCredsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredCredentials.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <KeyRound className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold">No Credentials Found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {providerFilter || healthFilter !== 'all'
              ? 'No credentials match the selected filters.'
              : 'Add your first API key for Gemini, Groq, or OpenAI.'}
          </p>
          <Button onClick={handleOpenAdd} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Credential</span>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredCredentials.map((cred) => {
            const provider = providers.find((p) => p.id === cred.provider_id);
            const quotaGroup = quotaGroups.find((q) => q.id === cred.quota_group_id);
            const health = cred.health;
            const isTesting = testMutation.isPending && testMutation.variables === cred.id;
            const isRecovering = recoverMutation.isPending && recoverMutation.variables?.id === cred.id;

            return (
              <Card key={cred.id} className="transition-shadow hover:shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Left: Info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{cred.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {provider ? provider.display_name : 'Unknown Provider'}
                        </Badge>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          Priority: #{cred.priority}
                        </Badge>
                        <StatusBadge status={health?.status || (cred.is_active ? 'healthy' : 'disabled')} />
                        {quotaGroup && (
                          <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                            <Layers className="h-3 w-3" />
                            <span>{quotaGroup.name}</span>
                          </Badge>
                        )}
                      </div>

                      {/* Secret Preview & Limits */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
                        <span className="bg-muted px-2 py-0.5 rounded text-foreground font-bold">
                          {cred.key_preview || '••••••••'}
                        </span>
                        {cred.rate_limit_rpm && <span>RPM: {cred.rate_limit_rpm}</span>}
                        {cred.rate_limit_tpm && <span>TPM: {cred.rate_limit_tpm}</span>}
                        {health?.cooldown_until && (
                          <span className="text-amber-600 dark:text-amber-400 font-sans font-medium flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Cooldown until {new Date(health.cooldown_until).toLocaleTimeString()}
                          </span>
                        )}
                        {health?.last_error_message && (
                          <span className="text-destructive truncate max-w-xs font-sans" title={health.last_error_message}>
                            Error: {health.last_error_message}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isTesting}
                        onClick={() => testMutation.mutate(cred.id)}
                        className="h-8 gap-1 text-xs"
                      >
                        <RefreshCw className={`h-3 w-3 ${isTesting ? 'animate-spin' : ''}`} />
                        <span>{isTesting ? 'Testing...' : 'Test Key'}</span>
                      </Button>

                      {/* Recover Button (if in cooldown or auth failure) */}
                      {health && health.status !== 'healthy' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isRecovering}
                          onClick={() => recoverMutation.mutate({ id: cred.id, validate: true })}
                          className="h-8 gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                          title="Safely verify and restore healthy status"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Recover</span>
                        </Button>
                      )}

                      {/* Cooldown Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCooldownCred(cred)}
                        className="h-8 text-xs text-amber-600 hover:text-amber-700"
                        title="Set manual cooldown"
                      >
                        <Flame className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Cooldown</span>
                      </Button>

                      {/* Replace Secret */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Replace API Key Secret"
                        onClick={() => {
                          setReplacingSecretCred(cred);
                          setNewSecretKey('');
                        }}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Key className="h-3.5 w-3.5" />
                      </Button>

                      {/* Edit Meta */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit Credential"
                        onClick={() => {
                          setEditingCred(cred);
                          setFormLabel(cred.label);
                          setFormQuotaGroupId(cred.quota_group_id || '');
                          setFormPriority(cred.priority);
                          setFormRpm(cred.rate_limit_rpm || '');
                          setFormTpm(cred.rate_limit_tpm || '');
                        }}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete Credential"
                        onClick={() => setDeletingCred(cred)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
        description="The secret key will be encrypted at rest using AES-256-GCM and never exposed via public APIs."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Provider <span className="text-destructive">*</span>
            </label>
            <Select
              value={formProviderId}
              onChange={(e) => setFormProviderId(e.target.value)}
              required
            >
              <option value="">Select a provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.name})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Label <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Gemini Project Production Key 01"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              API Key Secret <span className="text-destructive">*</span>
            </label>
            <Input
              type="password"
              placeholder="e.g. AIzaSy..., gsk_..., sk-proj-..."
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Encrypted immediately upon receipt. Cannot be retrieved in plaintext later.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Priority Ranking
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                1 = highest priority candidate.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Quota Group (Optional)
              </label>
              <Select
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
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                RPM Ceiling (Optional)
              </label>
              <Input
                type="number"
                placeholder="e.g. 60"
                value={formRpm}
                onChange={(e) => setFormRpm(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                TPM Ceiling (Optional)
              </label>
              <Input
                type="number"
                placeholder="e.g. 100000"
                value={formTpm}
                onChange={(e) => setFormTpm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Encrypting & Saving...' : 'Save Credential'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Credential Modal */}
      <Dialog
        open={!!editingCred}
        onClose={() => setEditingCred(null)}
        title="Edit Credential Metadata"
        description="Update priority ranking, label, or quota group assignment."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Label</label>
            <Input
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Priority Ranking
              </label>
              <Input
                type="number"
                min="1"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Quota Group
              </label>
              <Select
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

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setEditingCred(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Replace Secret Modal */}
      <Dialog
        open={!!replacingSecretCred}
        onClose={() => setReplacingSecretCred(null)}
        title="Replace API Key Secret"
        description={`Update the secret key for '${replacingSecretCred?.label}'. The previous key will be overwritten.`}
      >
        <form onSubmit={handleReplaceSecretSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              New API Key Secret <span className="text-destructive">*</span>
            </label>
            <Input
              type="password"
              placeholder="Paste new upstream API key..."
              value={newSecretKey}
              onChange={(e) => setNewSecretKey(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setReplacingSecretCred(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !newSecretKey}>
              Encrypt & Replace
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Manual Cooldown Modal */}
      <Dialog
        open={!!cooldownCred}
        onClose={() => setCooldownCred(null)}
        title="Apply Manual Cooldown"
        description={`Temporarily exclude '${cooldownCred?.label}' from routing.`}
      >
        <form onSubmit={handleApplyCooldownSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Duration (seconds)
            </label>
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
            <Button type="button" variant="outline" onClick={() => setCooldownCred(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={cooldownMutation.isPending}>
              Apply Cooldown
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deletingCred}
        onClose={() => setDeletingCred(null)}
        title="Revoke and Delete Credential?"
        description={`Are you sure you want to permanently delete '${deletingCred?.label}'? This action cannot be undone.`}
      >
        <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
          <Button variant="outline" onClick={() => setDeletingCred(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deletingCred && deleteMutation.mutate(deletingCred.id)}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Key'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
