import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  GitBranch,
  Plus,
  Edit,
  Trash2,
  ArrowDown,
  ArrowUp,
  Sliders,
  ShieldAlert,
} from 'lucide-react';

import { routingApi } from '../api/routing';
import { providersApi } from '../api/providers';
import { modelsApi } from '../api/models';
import { circuitBreakersApi } from '../api/circuitBreakers';
import { quotaGroupsApi } from '../api/quotaGroups';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { TimetableStrip, TimetableCell } from '../components/ui/Timetable';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { FallbackRecoveryPanel } from '../components/control/FallbackRecoveryPanel';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

export function Routing({ initialTab }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(initialTab || tabParam || 'aliases');
  const [selectedAliasId, setSelectedAliasId] = useState(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    else if (tabParam && ['aliases', 'profiles', 'recovery'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [initialTab, tabParam]);

  // Modals
  const [isAddAliasOpen, setIsAddAliasOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState(null);
  const [deletingAlias, setDeletingAlias] = useState(null);

  const [isAddProfileOpen, setIsAddProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [deletingProfile, setDeletingProfile] = useState(null);

  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false);

  // Alias form
  const [formAliasName, setFormAliasName] = useState('');
  const [formAliasDesc, setFormAliasDesc] = useState('');
  const [formAliasProfileId, setFormAliasProfileId] = useState('');
  const [formAliasMaxAttempts, setFormAliasMaxAttempts] = useState(3);
  const [formAliasTimeout, setFormAliasTimeout] = useState(30.0);
  const [formAliasEnabled, setFormAliasEnabled] = useState(true);

  // Profile form (matched directly to backend RoutingProfileCreate/Patch schema)
  const [formProfileName, setFormProfileName] = useState('');
  const [formProfileDesc, setFormProfileDesc] = useState('');
  const [formProfileStrategy, setFormProfileStrategy] = useState('priority');
  const [formProfileMaxAttempts, setFormProfileMaxAttempts] = useState(3);
  const [formProfileRetryAfterCooldown, setFormProfileRetryAfterCooldown] = useState(true);
  const [formProfileIsDefault, setFormProfileIsDefault] = useState(false);

  // Add Candidate form
  const [candProviderId, setCandProviderId] = useState('');
  const [candModelId, setCandModelId] = useState('');
  const [candWeight, setCandWeight] = useState(100);

  const { data: aliases = [], isLoading: isAliasesLoading } = useQuery({
    queryKey: ['routingAliases'],
    queryFn: routingApi.listAliases,
  });

  const { data: profiles = [], isLoading: isProfilesLoading } = useQuery({
    queryKey: ['routingProfiles'],
    queryFn: routingApi.listProfiles,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.listModels(),
  });

  const { data: circuitBreakers = [] } = useQuery({
    queryKey: ['circuitBreakers'],
    queryFn: circuitBreakersApi.listCircuitBreakers,
    refetchInterval: 10000,
  });

  const { data: quotaGroups = [] } = useQuery({
    queryKey: ['quotaGroups'],
    queryFn: quotaGroupsApi.listQuotaGroups,
    refetchInterval: 10000,
  });

  const currentAlias = aliases.find((a) => a.id === selectedAliasId) || aliases[0] || null;

  const createAliasMutation = useMutation({
    mutationFn: routingApi.createAlias,
    onSuccess: (newAlias) => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      toast.success(`Alias '${newAlias.alias_name}' created`);
      setIsAddAliasOpen(false);
      setSelectedAliasId(newAlias.id);
      resetAliasForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to create alias'),
  });

  const updateAliasMutation = useMutation({
    mutationFn: ({ id, payload }) => routingApi.updateAlias(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      toast.success('Alias updated');
      setEditingAlias(null);
      resetAliasForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to update alias'),
  });

  const deleteAliasMutation = useMutation({
    mutationFn: routingApi.deleteAlias,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      toast.success('Alias deleted');
      setDeletingAlias(null);
      setSelectedAliasId(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to delete alias'),
  });

  const updateCandidatesMutation = useMutation({
    mutationFn: ({ aliasId, candidates }) => routingApi.setAliasCandidates(aliasId, candidates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      toast.success('Failover candidate chain updated');
      setIsAddCandidateOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to update candidate chain'),
  });

  const createProfileMutation = useMutation({
    mutationFn: routingApi.createProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingProfiles'] });
      toast.success('Routing profile created');
      setIsAddProfileOpen(false);
      resetProfileForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to create profile'),
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, payload }) => routingApi.updateProfile(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingProfiles'] });
      toast.success('Routing profile updated');
      setEditingProfile(null);
      resetProfileForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to update profile'),
  });

  const deleteProfileMutation = useMutation({
    mutationFn: routingApi.deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingProfiles'] });
      toast.success('Routing profile deleted');
      setDeletingProfile(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to delete profile'),
  });

  const resetAliasForm = () => {
    setFormAliasName('');
    setFormAliasDesc('');
    setFormAliasProfileId(profiles[0]?.id || '');
    setFormAliasMaxAttempts(3);
    setFormAliasTimeout(30.0);
    setFormAliasEnabled(true);
  };

  const resetProfileForm = () => {
    setFormProfileName('');
    setFormProfileDesc('');
    setFormProfileStrategy('priority');
    setFormProfileMaxAttempts(3);
    setFormProfileRetryAfterCooldown(true);
    setFormProfileIsDefault(false);
  };

  const handleOpenAddAlias = () => {
    resetAliasForm();
    setIsAddAliasOpen(true);
  };

  const handleOpenEditAlias = (alias) => {
    setEditingAlias(alias);
    setFormAliasName(alias.alias_name);
    setFormAliasDesc(alias.description || '');
    setFormAliasProfileId(alias.profile_id || '');
    setFormAliasMaxAttempts(alias.max_attempts || 3);
    setFormAliasTimeout(alias.timeout_seconds || 30.0);
    setFormAliasEnabled(alias.is_enabled);
  };

  const handleSaveAlias = (e) => {
    e.preventDefault();
    const payload = {
      alias_name: formAliasName.trim().toLowerCase(),
      description: formAliasDesc.trim() || null,
      profile_id: formAliasProfileId || null,
      max_attempts: parseInt(formAliasMaxAttempts, 10) || 3,
      timeout_seconds: parseFloat(formAliasTimeout) || 30.0,
      is_enabled: formAliasEnabled,
    };

    if (editingAlias) {
      updateAliasMutation.mutate({ id: editingAlias.id, payload });
    } else {
      createAliasMutation.mutate({ ...payload, candidates: [] });
    }
  };

  const handleOpenEditProfile = (prof) => {
    setEditingProfile(prof);
    setFormProfileName(prof.name);
    setFormProfileDesc(prof.description || '');
    setFormProfileStrategy(prof.strategy || 'priority');
    setFormProfileMaxAttempts(prof.max_attempts || 3);
    setFormProfileRetryAfterCooldown(prof.retry_after_cooldown !== false);
    setFormProfileIsDefault(!!prof.is_default);
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    const payload = {
      name: formProfileName.trim(),
      description: formProfileDesc.trim() || null,
      strategy: formProfileStrategy,
      max_attempts: parseInt(formProfileMaxAttempts, 10) || 3,
      retry_after_cooldown: formProfileRetryAfterCooldown,
      is_default: formProfileIsDefault,
    };
    if (editingProfile) {
      updateProfileMutation.mutate({ id: editingProfile.id, payload });
    } else {
      createProfileMutation.mutate(payload);
    }
  };

  const normalizeCandidatesPayload = (items) =>
    items.map((c, i) => ({
      provider_id: c.provider_id,
      model_id: c.model_id,
      priority: i + 1,
      weight: Math.min(100, Math.max(1, parseInt(c.weight, 10) || 100)),
      is_active: c.is_active !== false,
    }));

  const sortedCandidates = currentAlias
    ? [...(currentAlias.candidates || [])].sort((a, b) => a.priority - b.priority)
    : [];

  const handleMoveCandidate = (index, direction) => {
    if (!currentAlias) return;
    const items = [...sortedCandidates];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const [moved] = items.splice(index, 1);
    items.splice(targetIdx, 0, moved);

    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: normalizeCandidatesPayload(items),
    });
  };

  const handleToggleCandidateActive = (index) => {
    if (!currentAlias) return;
    const items = sortedCandidates.map((c, idx) =>
      idx === index ? { ...c, is_active: !(c.is_active !== false) } : c
    );
    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: normalizeCandidatesPayload(items),
    });
  };

  const handleRemoveCandidate = (candidateId) => {
    if (!currentAlias) return;
    const remaining = sortedCandidates.filter((c) => c.id !== candidateId);
    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: normalizeCandidatesPayload(remaining),
    });
  };

  const handleAddCandidateSubmit = (e) => {
    e.preventDefault();
    if (!currentAlias || !candProviderId || !candModelId) return;

    const nextItems = [
      ...sortedCandidates,
      {
        provider_id: candProviderId,
        model_id: candModelId,
        priority: sortedCandidates.length + 1,
        weight: Math.min(100, Math.max(1, parseInt(candWeight, 10) || 100)),
        is_active: true,
      },
    ];

    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: normalizeCandidatesPayload(nextItems),
    });
  };

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  const candidateProviderModels = models.filter((m) => m.provider_id === candProviderId);
  const openBreakersCount = circuitBreakers.filter((cb) => cb.state === 'OPEN').length;
  const activeAliasesCount = aliases.filter((a) => a.is_enabled).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Routing & Failover"
        description="Configure model alias schedules, prioritized provider failover chains, routing profiles, and circuit-breaker recovery."
        actions={
          activeTab === 'profiles' ? (
            <Button size="sm" onClick={() => { resetProfileForm(); setIsAddProfileOpen(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>New Profile</span>
            </Button>
          ) : (
            <Button size="sm" onClick={handleOpenAddAlias} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>New Alias</span>
            </Button>
          )
        }
      />

      <TimetableStrip>
        <TimetableCell
          label="Model Aliases"
          tag="ROUTES"
          loading={isAliasesLoading}
          value={`${activeAliasesCount} / ${aliases.length}`}
          subtext="Active client targets"
        />
        <TimetableCell
          label="Routing Profiles"
          tag="POLICY"
          loading={isProfilesLoading}
          value={profiles.length}
          subtext="Retry & strategy presets"
        />
        <TimetableCell
          label="Circuit Breakers"
          tag="PROTECTION"
          value={openBreakersCount > 0 ? `${openBreakersCount} OPEN` : `${circuitBreakers.length} CLOSED`}
          tone={openBreakersCount > 0 ? 'err' : 'ok'}
          subtext="Automated outage isolation"
        />
        <TimetableCell
          label="Quota Groups"
          tag="SHARED POOL"
          value={quotaGroups.length}
          subtext={`${quotaGroups.filter((q) => q.status !== 'healthy').length} in cooldown`}
        />
      </TimetableStrip>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="aliases" className="gap-2">
            <GitBranch className="h-3.5 w-3.5" />
            <span>Model Aliases ({aliases.length})</span>
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-2">
            <Sliders className="h-3.5 w-3.5" />
            <span>Routing Profiles ({profiles.length})</span>
          </TabsTrigger>
          <TabsTrigger value="recovery" className="gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Fallback &amp; Recovery</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ALIASES & FAILOVER CHAIN */}
        <TabsContent value="aliases">
          {isAliasesLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : aliases.length === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="No model aliases configured"
              description="Define aliases like fast, smart, or coding mapped to prioritized cross-provider fallback chains."
              actionLabel="Create First Alias"
              onAction={handleOpenAddAlias}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-12">
              {/* Left Rail: Alias Directory */}
              <div className="lg:col-span-4 rounded border border-border bg-card divide-y divide-border overflow-hidden self-start">
                <div className="bg-surface-subtle px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                  Configured Alias Directory
                </div>
                {aliases.map((alias) => {
                  const isSelected = currentAlias?.id === alias.id;
                  const candCount = alias.candidates?.length || 0;
                  return (
                    <button
                      type="button"
                      key={alias.id}
                      onClick={() => setSelectedAliasId(alias.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors flex items-start justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected
                          ? 'bg-muted/70'
                          : 'hover:bg-muted/35'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {isSelected && <span className="h-1.5 w-1.5 rounded-[1px] bg-primary shrink-0" />}
                          <span className="font-mono text-sm font-bold text-foreground truncate">
                            {alias.alias_name}
                          </span>
                          <StatusBadge status={alias.is_enabled ? 'active' : 'disabled'} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {alias.description || 'Priority fallback sequence'}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                        {candCount} {candCount === 1 ? 'track' : 'tracks'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Right Inspector: Visual Failover Track Chain */}
              <div className="lg:col-span-8">
                {currentAlias && (
                  <section className="rounded border border-border bg-card overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="font-mono text-lg font-bold text-foreground">
                            {currentAlias.alias_name}
                          </h2>
                          <StatusBadge status={currentAlias.is_enabled ? 'active' : 'disabled'} />
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                          Max Attempts: {currentAlias.max_attempts} · Timeout: {currentAlias.timeout_seconds}s
                          {currentAlias.description ? ` · ${currentAlias.description}` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCandProviderId(providers[0]?.id || '');
                            setCandModelId('');
                            setCandWeight(100);
                            setIsAddCandidateOpen(true);
                          }}
                          className="h-8 gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Track</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditAlias(currentAlias)}
                          aria-label={`Edit alias ${currentAlias.alias_name}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingAlias(currentAlias)}
                          className="hover:text-status-err"
                          aria-label={`Delete alias ${currentAlias.alias_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Requests addressing <code className="font-mono text-foreground font-semibold">model=&quot;{currentAlias.alias_name}&quot;</code> execute Track 01 first, cascading down in strict priority sequence upon retryable upstream rate limits or outages.
                      </p>

                      {sortedCandidates.length === 0 ? (
                        <EmptyState
                          icon={GitBranch}
                          title="No failover tracks attached"
                          description="Add one or more provider models to activate this routing alias."
                          actionLabel="Add First Track"
                          onAction={() => {
                            setCandProviderId(providers[0]?.id || '');
                            setCandModelId('');
                            setIsAddCandidateOpen(true);
                          }}
                        />
                      ) : (
                        <div className="space-y-2">
                          {sortedCandidates.map((cand, idx) => {
                            const isFirst = idx === 0;
                            const isLast = idx === sortedCandidates.length - 1;
                            const provider = providers.find((p) => p.id === cand.provider_id);
                            const model = models.find((m) => m.id === cand.model_id);
                            const providerDisplay = provider?.display_name || cand.provider_name || 'Provider';
                            const modelIdText = model?.model_identifier || cand.model_identifier || 'Model';
                            const active = cand.is_active !== false;

                            return (
                              <React.Fragment key={cand.id || idx}>
                                <div
                                  className={cn(
                                    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded border p-3.5 transition-colors',
                                    isFirst && active
                                      ? 'border-route/50 bg-route/5'
                                      : 'border-border bg-background',
                                    !active && 'opacity-55'
                                  )}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={cn(
                                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-xs font-bold tabular-nums',
                                        isFirst && active
                                          ? 'border-route bg-route/15 text-route'
                                          : 'border-border bg-card text-muted-foreground'
                                      )}
                                    >
                                      {String(idx + 1).padStart(2, '0')}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-semibold text-foreground">
                                          {providerDisplay}
                                        </span>
                                        <span className="text-muted-foreground font-mono text-xs">/</span>
                                        <code className="font-mono text-xs font-semibold text-route truncate">
                                          {modelIdText}
                                        </code>
                                        {isFirst && (
                                          <Badge variant="route" className="font-mono text-[10px]">
                                            PRIMARY
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                                        Priority #{cand.priority} · Weight {cand.weight || 100}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Switch
                                      checked={active}
                                      disabled={updateCandidatesMutation.isPending}
                                      onCheckedChange={() => handleToggleCandidateActive(idx)}
                                      aria-label={`Toggle candidate ${modelIdText}`}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={isFirst || updateCandidatesMutation.isPending}
                                      onClick={() => handleMoveCandidate(idx, -1)}
                                      aria-label={`Move ${modelIdText} higher in priority`}
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={isLast || updateCandidatesMutation.isPending}
                                      onClick={() => handleMoveCandidate(idx, 1)}
                                      aria-label={`Move ${modelIdText} lower in priority`}
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={updateCandidatesMutation.isPending}
                                      onClick={() => handleRemoveCandidate(cand.id)}
                                      className="hover:text-status-err"
                                      aria-label={`Remove ${modelIdText} from chain`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                {!isLast && (
                                  <div className="flex items-center gap-2 pl-6 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    <div className="h-3 w-px bg-border" />
                                    <span>ON FAILOVER &rarr;</span>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: PROFILES */}
        <TabsContent value="profiles">
          {isProfilesLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : profiles.length === 0 ? (
            <EmptyState
              icon={Sliders}
              title="No routing profiles defined"
              description="Profiles encapsulate reusable failover attempt ceilings, strategy modes, and cooldown policies."
              actionLabel="Create Routing Profile"
              onAction={() => { resetProfileForm(); setIsAddProfileOpen(true); }}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {profiles.map((profile) => (
                <section key={profile.id} className="rounded border border-border bg-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-border">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground truncate">{profile.name}</h3>
                          {profile.is_default && <StatusBadge status="active" labelOverride="DEFAULT" />}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {profile.description || 'Reusable failover policy profile'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditProfile(profile)}
                          aria-label={`Edit profile ${profile.name}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingProfile(profile)}
                          className="hover:text-status-err"
                          aria-label={`Delete profile ${profile.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <dl className="mt-3 space-y-2 text-xs font-mono tabular-nums">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground font-sans">Strategy</dt>
                        <dd className="font-semibold uppercase text-foreground">{profile.strategy}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground font-sans">Max Attempts</dt>
                        <dd className="text-foreground">{profile.max_attempts}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground font-sans">Retry After Cooldown</dt>
                        <dd className={profile.retry_after_cooldown ? 'text-status-ok' : 'text-muted-foreground'}>
                          {profile.retry_after_cooldown ? 'Enabled' : 'Disabled'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: FALLBACK & RECOVERY */}
        <TabsContent value="recovery">
          <FallbackRecoveryPanel providers={providers} />
        </TabsContent>
      </Tabs>

      {/* Add / Edit Alias Dialog */}
      <Dialog
        open={isAddAliasOpen || !!editingAlias}
        onClose={() => {
          setIsAddAliasOpen(false);
          setEditingAlias(null);
          resetAliasForm();
        }}
        title={editingAlias ? `Edit Alias: ${editingAlias.alias_name}` : 'Create Model Alias'}
        description="Expose a stable model alias (e.g. fast, smart, coding) mapped to prioritized upstream candidates."
      >
        <form onSubmit={handleSaveAlias} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="alias-name" className="text-xs font-medium text-foreground block">
              Alias Identifier <span className="text-status-err">*</span>
            </label>
            <Input
              id="alias-name"
              placeholder="fast, smart, coding, cheap"
              value={formAliasName}
              onChange={(e) => setFormAliasName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="alias-desc" className="text-xs font-medium text-foreground block">
              Description (Optional)
            </label>
            <Input
              id="alias-desc"
              placeholder="Low-latency tier across Groq and Gemini Flash"
              value={formAliasDesc}
              onChange={(e) => setFormAliasDesc(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="alias-prof" className="text-xs font-medium text-foreground block">
              Routing Profile
            </label>
            <Select
              id="alias-prof"
              value={formAliasProfileId}
              onChange={(e) => setFormAliasProfileId(e.target.value)}
            >
              <option value="">System Default</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.strategy})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="alias-attempts" className="text-xs font-medium text-foreground block">
                Max Attempts
              </label>
              <Input
                id="alias-attempts"
                type="number"
                min={1}
                max={10}
                value={formAliasMaxAttempts}
                onChange={(e) => setFormAliasMaxAttempts(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="alias-timeout" className="text-xs font-medium text-foreground block">
                Timeout (sec)
              </label>
              <Input
                id="alias-timeout"
                type="number"
                step="0.5"
                min={1}
                max={300}
                value={formAliasTimeout}
                onChange={(e) => setFormAliasTimeout(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <span className="text-xs font-medium">Alias Enabled</span>
              <p className="text-[11px] text-muted-foreground">
                Clients can address this alias through /v1/chat/completions.
              </p>
            </div>
            <Switch checked={formAliasEnabled} onCheckedChange={setFormAliasEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddAliasOpen(false);
                setEditingAlias(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createAliasMutation.isPending || updateAliasMutation.isPending}>
              {editingAlias ? 'Save Changes' : 'Create Alias'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Candidate Dialog */}
      <Dialog
        open={isAddCandidateOpen}
        onClose={() => setIsAddCandidateOpen(false)}
        title={`Add Track to '${currentAlias?.alias_name}'`}
        description="Append a provider/model candidate at the next sequential failover priority."
      >
        <form onSubmit={handleAddCandidateSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cand-prov" className="text-xs font-medium text-foreground block">
              Provider <span className="text-status-err">*</span>
            </label>
            <Select
              id="cand-prov"
              value={candProviderId}
              onChange={(e) => {
                setCandProviderId(e.target.value);
                setCandModelId('');
              }}
              required
            >
              <option value="">Select provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cand-mod" className="text-xs font-medium text-foreground block">
              Model <span className="text-status-err">*</span>
            </label>
            <Select
              id="cand-mod"
              value={candModelId}
              onChange={(e) => setCandModelId(e.target.value)}
              disabled={!candProviderId}
              required
            >
              <option value="">Select model...</option>
              {candidateProviderModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.model_identifier})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cand-weight" className="text-xs font-medium text-foreground block">
              Weight (1–100)
            </label>
            <Input
              id="cand-weight"
              type="number"
              min={1}
              max={100}
              value={candWeight}
              onChange={(e) => setCandWeight(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddCandidateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!candModelId || updateCandidatesMutation.isPending}>
              Append to Chain
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Alias Dialog */}
      <Dialog
        open={!!deletingAlias}
        onClose={() => setDeletingAlias(null)}
        title="Delete Model Alias?"
        description={`Delete '${deletingAlias?.alias_name}'? Client requests referencing this alias will return 404 Not Found.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeletingAlias(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteAliasMutation.isPending}
            onClick={() => deletingAlias && deleteAliasMutation.mutate(deletingAlias.id)}
          >
            {deleteAliasMutation.isPending ? 'Deleting...' : 'Delete Alias'}
          </Button>
        </div>
      </Dialog>

      {/* Add / Edit Profile Dialog */}
      <Dialog
        open={isAddProfileOpen || !!editingProfile}
        onClose={() => {
          setIsAddProfileOpen(false);
          setEditingProfile(null);
        }}
        title={editingProfile ? `Edit Profile: ${editingProfile.name}` : 'Create Routing Profile'}
        description="Define reusable retry attempts and cooldown recovery strategies."
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="prof-name" className="text-xs font-medium text-foreground block">
              Profile Name <span className="text-status-err">*</span>
            </label>
            <Input
              id="prof-name"
              placeholder="e.g. high-resilience"
              value={formProfileName}
              onChange={(e) => setFormProfileName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="prof-desc" className="text-xs font-medium text-foreground block">
              Description (Optional)
            </label>
            <Input
              id="prof-desc"
              placeholder="Mission-critical sequential fallback"
              value={formProfileDesc}
              onChange={(e) => setFormProfileDesc(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="prof-strategy" className="text-xs font-medium text-foreground block">
                Strategy
              </label>
              <Select
                id="prof-strategy"
                value={formProfileStrategy}
                onChange={(e) => setFormProfileStrategy(e.target.value)}
              >
                <option value="priority">priority (Sequential Fallback)</option>
                <option value="fallback">fallback</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="prof-attempts" className="text-xs font-medium text-foreground block">
                Max Attempts
              </label>
              <Input
                id="prof-attempts"
                type="number"
                min={1}
                max={10}
                value={formProfileMaxAttempts}
                onChange={(e) => setFormProfileMaxAttempts(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <span className="text-xs font-medium">Retry After Cooldown</span>
              <p className="text-[11px] text-muted-foreground">
                Automatically restore candidates once cooldown expires.
              </p>
            </div>
            <Switch
              checked={formProfileRetryAfterCooldown}
              onCheckedChange={setFormProfileRetryAfterCooldown}
            />
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <span className="text-xs font-medium">Default Profile</span>
              <p className="text-[11px] text-muted-foreground">
                Apply to requests without an explicit profile override.
              </p>
            </div>
            <Switch checked={formProfileIsDefault} onCheckedChange={setFormProfileIsDefault} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddProfileOpen(false);
                setEditingProfile(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createProfileMutation.isPending || updateProfileMutation.isPending}>
              {editingProfile ? 'Save Changes' : 'Create Profile'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Profile Dialog */}
      <Dialog
        open={!!deletingProfile}
        onClose={() => setDeletingProfile(null)}
        title="Delete Routing Profile?"
        description={`Delete profile '${deletingProfile?.name}'? Linked aliases will revert to default behavior.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeletingProfile(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteProfileMutation.isPending}
            onClick={() => deletingProfile && deleteProfileMutation.mutate(deletingProfile.id)}
          >
            {deleteProfileMutation.isPending ? 'Deleting...' : 'Delete Profile'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
export default Routing;
