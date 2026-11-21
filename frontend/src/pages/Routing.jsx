import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  Plus,
  Edit,
  Trash2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Layers,
  Clock,
  Shield,
  Zap,
  Sliders,
  Sparkles,
} from 'lucide-react';

import { routingApi } from '../api/routing';
import { providersApi } from '../api/providers';
import { modelsApi } from '../api/models';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function Routing() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('aliases');
  const [selectedAliasId, setSelectedAliasId] = useState(null);

  // Modals
  const [isAddAliasOpen, setIsAddAliasOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState(null);
  const [deletingAlias, setDeletingAlias] = useState(null);

  const [isAddProfileOpen, setIsAddProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false);

  // Form states - Alias
  const [formAliasName, setFormAliasName] = useState('');
  const [formAliasDesc, setFormAliasDesc] = useState('');
  const [formAliasProfileId, setFormAliasProfileId] = useState('');
  const [formAliasMaxAttempts, setFormAliasMaxAttempts] = useState(3);
  const [formAliasTimeout, setFormAliasTimeout] = useState(30.0);
  const [formAliasEnabled, setFormAliasEnabled] = useState(true);

  // Form states - Profile
  const [formProfileName, setFormProfileName] = useState('');
  const [formProfileDesc, setFormProfileDesc] = useState('');
  const [formProfileStrategy, setFormProfileStrategy] = useState('priority');
  const [formProfileMaxAttempts, setFormProfileMaxAttempts] = useState(3);
  const [formProfileTimeout, setFormProfileTimeout] = useState(30.0);
  const [formProfileIsDefault, setFormProfileIsDefault] = useState(false);

  // Form states - Candidate Add
  const [candProviderId, setCandProviderId] = useState('');
  const [candModelId, setCandModelId] = useState('');

  // Queries
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

  // Selected Alias object
  const currentAlias =
    aliases.find((a) => a.id === selectedAliasId) || aliases[0] || null;

  // Mutations
  const createAliasMutation = useMutation({
    mutationFn: routingApi.createAlias,
    onSuccess: (newAlias) => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      addToast(`Alias '${newAlias.alias_name}' created successfully`, 'success');
      setIsAddAliasOpen(false);
      setSelectedAliasId(newAlias.id);
      resetAliasForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to create alias', 'error');
    },
  });

  const updateAliasMutation = useMutation({
    mutationFn: ({ id, payload }) => routingApi.updateAlias(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      addToast('Alias updated successfully', 'success');
      setEditingAlias(null);
      resetAliasForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to update alias', 'error');
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: routingApi.deleteAlias,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      addToast('Alias deleted permanently', 'success');
      setDeletingAlias(null);
      setSelectedAliasId(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to delete alias', 'error');
    },
  });

  const updateCandidatesMutation = useMutation({
    mutationFn: ({ aliasId, candidates }) =>
      routingApi.setAliasCandidates(aliasId, candidates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingAliases'] });
      addToast('Candidate failover order updated', 'success');
      setIsAddCandidateOpen(false);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to update candidates', 'error');
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: routingApi.createProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routingProfiles'] });
      addToast('Routing profile created', 'success');
      setIsAddProfileOpen(false);
      resetProfileForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to create profile', 'error');
    },
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
    setFormProfileTimeout(30.0);
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
    if (editingAlias) {
      updateAliasMutation.mutate({
        id: editingAlias.id,
        payload: {
          alias_name: formAliasName.trim(),
          description: formAliasDesc || null,
          profile_id: formAliasProfileId || null,
          max_attempts: parseInt(formAliasMaxAttempts, 10),
          timeout_seconds: parseFloat(formAliasTimeout),
          is_enabled: formAliasEnabled,
        },
      });
    } else {
      createAliasMutation.mutate({
        alias_name: formAliasName.trim().toLowerCase(),
        description: formAliasDesc || null,
        profile_id: formAliasProfileId || null,
        max_attempts: parseInt(formAliasMaxAttempts, 10),
        timeout_seconds: parseFloat(formAliasTimeout),
        is_enabled: formAliasEnabled,
        candidates: [],
      });
    }
  };

  const handleMoveCandidate = (index, direction) => {
    if (!currentAlias) return;
    const items = [...currentAlias.candidates];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    // Re-assign priorities 1, 2, 3...
    const payload = items.map((c, i) => ({
      provider_id: c.provider_id,
      model_id: c.model_id,
      priority: i + 1,
      weight: c.weight || 1.0,
      is_enabled: c.is_enabled,
    }));

    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: payload,
    });
  };

  const handleRemoveCandidate = (candidateId) => {
    if (!currentAlias) return;
    const remaining = currentAlias.candidates.filter((c) => c.id !== candidateId);
    const payload = remaining.map((c, i) => ({
      provider_id: c.provider_id,
      model_id: c.model_id,
      priority: i + 1,
      weight: c.weight || 1.0,
      is_enabled: c.is_enabled,
    }));

    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: payload,
    });
  };

  const handleAddCandidateSubmit = (e) => {
    e.preventDefault();
    if (!currentAlias || !candProviderId || !candModelId) return;

    const existing = currentAlias.candidates || [];
    const payload = [
      ...existing.map((c, i) => ({
        provider_id: c.provider_id,
        model_id: c.model_id,
        priority: i + 1,
        weight: c.weight || 1.0,
        is_enabled: c.is_enabled,
      })),
      {
        provider_id: candProviderId,
        model_id: candModelId,
        priority: existing.length + 1,
        weight: 1.0,
        is_enabled: true,
      },
    ];

    updateCandidatesMutation.mutate({
      aliasId: currentAlias.id,
      candidates: payload,
    });
  };

  // Filter models for candidate modal based on selected provider
  const candidateProviderModels = models.filter((m) => m.provider_id === candProviderId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Routing & Failover"
          description="Configure model aliases, candidate priority fallback orders, and reusable routing profiles."
        />
        <div className="flex items-center gap-2">
          {activeTab === 'aliases' ? (
            <Button onClick={handleOpenAddAlias} className="gap-2">
              <Plus className="h-4 w-4" />
              <span>New Alias</span>
            </Button>
          ) : (
            <Button onClick={() => setIsAddProfileOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span>New Profile</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="aliases" className="gap-2">
            <GitBranch className="h-3.5 w-3.5" />
            <span>Model Aliases</span>
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-2">
            <Sliders className="h-3.5 w-3.5" />
            <span>Routing Profiles</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MODEL ALIASES */}
        <TabsContent value="aliases" className="space-y-6">
          {isAliasesLoading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : aliases.length === 0 ? (
            <Card className="border-dashed p-8 text-center">
              <GitBranch className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 text-base font-semibold">No Model Aliases Configured</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create aliases like 'fast', 'smart', or 'coding' to automatically route across multi-provider candidates.
              </p>
              <Button onClick={handleOpenAddAlias} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                <span>Create First Alias</span>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Left Column: Aliases List (4 cols) */}
              <div className="lg:col-span-4 space-y-3">
                <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase px-1">
                  Configured Aliases
                </div>
                {aliases.map((alias) => {
                  const isSelected = currentAlias?.id === alias.id;
                  const candCount = alias.candidates?.length || 0;
                  return (
                    <Card
                      key={alias.id}
                      onClick={() => setSelectedAliasId(alias.id)}
                      className={`cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary shadow-sm bg-primary/[0.02]'
                          : 'hover:border-muted-foreground/30'
                      }`}
                    >
                      <CardContent className="p-3.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm font-mono text-foreground">
                                {alias.alias_name}
                              </span>
                              <Badge
                                variant={alias.is_enabled ? 'success' : 'secondary'}
                                className="text-[10px]"
                              >
                                {alias.is_enabled ? 'ACTIVE' : 'OFF'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {alias.description || 'No description configured'}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                            {candCount} {candCount === 1 ? 'candidate' : 'candidates'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Right Column: Visualization & Candidate Chain (8 cols) */}
              <div className="lg:col-span-8 space-y-4">
                {currentAlias ? (
                  <Card>
                    <CardHeader className="border-b pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <CardTitle className="text-lg font-mono font-bold">
                              {currentAlias.alias_name}
                            </CardTitle>
                            <Badge variant={currentAlias.is_enabled ? 'success' : 'secondary'}>
                              {currentAlias.is_enabled ? 'Active' : 'Disabled'}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs mt-1">
                            {currentAlias.description || 'Configured routing tier'} • Max attempts: {currentAlias.max_attempts} • Timeout: {currentAlias.timeout_seconds}s
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCandProviderId(providers[0]?.id || '');
                              setCandModelId('');
                              setIsAddCandidateOpen(true);
                            }}
                            className="gap-1.5 text-xs h-8"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Add Candidate</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditAlias(currentAlias)}
                            className="h-8 w-8 text-muted-foreground"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingAlias(currentAlias)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-6">
                      <div className="space-y-2 mb-4">
                        <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase block">
                          Visual Candidate Failover Chain
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Requests to <code className="font-mono text-primary font-bold">"{currentAlias.alias_name}"</code> attempt Candidate 1 first. If it encounters a retryable failure (such as rate limits or service outages), it automatically falls over in sequential priority order.
                        </p>
                      </div>

                      {/* Visual Flow Representation */}
                      {(!currentAlias.candidates || currentAlias.candidates.length === 0) ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                          No candidates attached to this alias yet. Click "Add Candidate" above to add providers.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {currentAlias.candidates.map((cand, idx) => {
                            const isFirst = idx === 0;
                            const isLast = idx === currentAlias.candidates.length - 1;
                            const provider = providers.find((p) => p.id === cand.provider_id) || cand.provider;
                            const model = models.find((m) => m.id === cand.model_id) || cand.model;

                            return (
                              <React.Fragment key={cand.id || idx}>
                                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/50">
                                  {/* Priority Number */}
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-xs font-bold">
                                    {idx + 1}
                                  </div>

                                  {/* Provider & Model Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-xs text-foreground">
                                        {provider ? provider.display_name : 'Provider'}
                                      </span>
                                      <span className="text-muted-foreground text-xs">/</span>
                                      <span className="font-mono text-xs text-primary font-bold truncate">
                                        {model ? model.model_identifier : 'Model'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                                      <span>Priority #{cand.priority}</span>
                                      <span>•</span>
                                      <span>Weight: {cand.weight || 1.0}</span>
                                    </div>
                                  </div>

                                  {/* Priority Reordering Controls */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={isFirst || updateCandidatesMutation.isPending}
                                      onClick={() => handleMoveCandidate(idx, -1)}
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      title="Increase Priority (Move Up)"
                                    >
                                      <ArrowUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={isLast || updateCandidatesMutation.isPending}
                                      onClick={() => handleMoveCandidate(idx, 1)}
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      title="Decrease Priority (Move Down)"
                                    >
                                      <ArrowDown className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={updateCandidatesMutation.isPending}
                                      onClick={() => handleRemoveCandidate(cand.id)}
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      title="Remove from Alias"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>

                                {!isLast && (
                                  <div className="flex justify-center py-0.5 text-muted-foreground/60">
                                    <ArrowDown className="h-4 w-4" />
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: ROUTING PROFILES */}
        <TabsContent value="profiles" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <Card key={profile.id} className="transition-shadow hover:shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{profile.name}</CardTitle>
                    {profile.is_default && (
                      <Badge variant="success" className="text-[10px]">
                        DEFAULT
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {profile.description || 'Configured routing profile'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Strategy:</span>
                    <span className="font-mono font-semibold text-foreground uppercase">
                      {profile.strategy}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Max Attempts:</span>
                    <span className="font-mono text-foreground">{profile.max_attempts}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Timeout Budget:</span>
                    <span className="font-mono text-foreground">
                      {profile.request_timeout_seconds}s
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
        title={editingAlias ? 'Edit Model Alias' : 'Create Model Alias'}
        description="Model aliases expose unified endpoint names (e.g. 'fast', 'smart') to clients."
      >
        <form onSubmit={handleSaveAlias} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Alias Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. fast, smart, coding, cheap"
              value={formAliasName}
              onChange={(e) => setFormAliasName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Description (Optional)
            </label>
            <Input
              placeholder="e.g. Fast response tier with multi-provider fallbacks"
              value={formAliasDesc}
              onChange={(e) => setFormAliasDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Routing Profile
            </label>
            <Select
              value={formAliasProfileId}
              onChange={(e) => setFormAliasProfileId(e.target.value)}
            >
              <option value="">Default Profile</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.strategy})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Max Attempts
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                value={formAliasMaxAttempts}
                onChange={(e) => setFormAliasMaxAttempts(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Timeout (seconds)
              </label>
              <Input
                type="number"
                step="0.5"
                min="1"
                value={formAliasTimeout}
                onChange={(e) => setFormAliasTimeout(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <span className="text-xs font-medium">Alias Enabled</span>
              <p className="text-[11px] text-muted-foreground">
                When enabled, clients can request this alias via /v1/chat/completions.
              </p>
            </div>
            <Switch checked={formAliasEnabled} onCheckedChange={setFormAliasEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
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
        title="Add Candidate to Alias"
        description={`Add a provider and model candidate to '${currentAlias?.alias_name}'.`}
      >
        <form onSubmit={handleAddCandidateSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Provider <span className="text-destructive">*</span>
            </label>
            <Select
              value={candProviderId}
              onChange={(e) => {
                setCandProviderId(e.target.value);
                setCandModelId('');
              }}
              required
            >
              <option value="">Select a provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Model <span className="text-destructive">*</span>
            </label>
            <Select
              value={candModelId}
              onChange={(e) => setCandModelId(e.target.value)}
              disabled={!candProviderId}
              required
            >
              <option value="">Select a model...</option>
              {candidateProviderModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.model_identifier})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setIsAddCandidateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!candModelId || updateCandidatesMutation.isPending}>
              Add to Chain
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Alias Dialog */}
      <Dialog
        open={!!deletingAlias}
        onClose={() => setDeletingAlias(null)}
        title="Delete Model Alias?"
        description={`Are you sure you want to delete alias '${deletingAlias?.alias_name}'? Client requests addressing this alias will return a 404 error.`}
      >
        <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
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

      {/* Add Profile Dialog */}
      <Dialog
        open={isAddProfileOpen}
        onClose={() => setIsAddProfileOpen(false)}
        title="Create Routing Profile"
        description="Routing profiles define reusable strategy and retry parameters."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createProfileMutation.mutate({
              name: formProfileName.trim(),
              description: formProfileDesc || null,
              strategy: formProfileStrategy,
              max_attempts: parseInt(formProfileMaxAttempts, 10),
              request_timeout_seconds: parseFloat(formProfileTimeout),
              is_default: formProfileIsDefault,
            });
          }}
          className="space-y-4 mt-2"
        >
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Profile Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. high-reliability-tier"
              value={formProfileName}
              onChange={(e) => setFormProfileName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Strategy
            </label>
            <Select
              value={formProfileStrategy}
              onChange={(e) => setFormProfileStrategy(e.target.value)}
            >
              <option value="priority">Priority-based (Sequential Fallback)</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Max Attempts
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                value={formProfileMaxAttempts}
                onChange={(e) => setFormProfileMaxAttempts(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Timeout (seconds)
              </label>
              <Input
                type="number"
                min="1"
                value={formProfileTimeout}
                onChange={(e) => setFormProfileTimeout(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <span className="text-xs font-medium">Default Profile</span>
              <p className="text-[11px] text-muted-foreground">
                Set as default profile for newly registered aliases.
              </p>
            </div>
            <Switch
              checked={formProfileIsDefault}
              onCheckedChange={setFormProfileIsDefault}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setIsAddProfileOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProfileMutation.isPending}>
              Create Profile
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
