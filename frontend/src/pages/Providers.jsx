import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Server,
  Plus,
  KeyRound,
  Boxes,
  Edit,
  Trash2,
  Sparkles,
} from 'lucide-react';

import { providersApi } from '../api/providers';
import { credentialsApi } from '../api/credentials';
import { modelsApi } from '../api/models';
import { routingApi } from '../api/routing';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { TimetableStrip, TimetableCell } from '../components/ui/Timetable';
import { EmptyState } from '../components/ui/EmptyState';
import { CredentialsPanel } from '../components/infrastructure/CredentialsPanel';
import { ModelsPanel } from '../components/infrastructure/ModelsPanel';
import { useToast } from '../components/ui/Toast';

export function Providers({ initialTab }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const providerParam = searchParams.get('provider') || '';
  const [activeTab, setActiveTab] = useState(initialTab || tabParam || 'providers');
  const [providerFilter, setProviderFilter] = useState(providerParam);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    else if (tabParam && ['providers', 'credentials', 'models'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [initialTab, tabParam]);

  useEffect(() => {
    setProviderFilter(providerParam);
  }, [providerParam]);

  // Provider modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [deletingProvider, setDeletingProvider] = useState(null);

  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formIsEnabled, setFormIsEnabled] = useState(true);

  const { data: providers = [], isLoading: isProvidersLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  const { data: routingHealth = {} } = useQuery({
    queryKey: ['routingHealthOverview'],
    queryFn: routingApi.getRoutingHealth,
    refetchInterval: 15000,
  });

  const { data: allCredentials = [] } = useQuery({
    queryKey: ['credentials', null],
    queryFn: () => credentialsApi.listCredentials(null),
  });

  const { data: allModels = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.listModels(),
  });

  const createMutation = useMutation({
    mutationFn: providersApi.createProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      toast.success('Provider adapter registered');
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to create provider'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => providersApi.updateProvider(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      toast.success('Provider configuration updated');
      setEditingProvider(null);
      resetForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to update provider'),
  });

  const deleteMutation = useMutation({
    mutationFn: providersApi.deleteProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
      queryClient.invalidateQueries({ queryKey: ['routingHealthOverview'] });
      toast.success('Provider deleted');
      setDeletingProvider(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to delete provider'),
  });

  const discoverMutation = useMutation({
    mutationFn: providersApi.discoverModels,
    onSuccess: (models) => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success(`Synced ${models.length} upstream catalog models`);
    },
    onError: (err) => toast.error(err.message || 'Upstream model discovery failed'),
  });

  const resetForm = () => {
    setFormName('');
    setFormDisplayName('');
    setFormDescription('');
    setFormBaseUrl('');
    setFormIsEnabled(true);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (p) => {
    setEditingProvider(p);
    setFormName(p.name);
    setFormDisplayName(p.display_name);
    setFormDescription(p.description || '');
    setFormBaseUrl(p.base_url || '');
    setFormIsEnabled(p.is_enabled);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (editingProvider) {
      updateMutation.mutate({
        id: editingProvider.id,
        payload: {
          display_name: formDisplayName.trim(),
          description: formDescription.trim() || null,
          base_url: formBaseUrl.trim() || null,
          is_enabled: formIsEnabled,
        },
      });
    } else {
      createMutation.mutate({
        name: formName.trim().toLowerCase(),
        display_name: formDisplayName.trim(),
        description: formDescription.trim() || null,
        base_url: formBaseUrl.trim() || null,
        is_enabled: formIsEnabled,
      });
    }
  };

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  };

  const handleJumpToProviderTab = (tab, providerId) => {
    setActiveTab(tab);
    setProviderFilter(providerId);
    setSearchParams({ tab, provider: providerId }, { replace: true });
  };

  const healthProviders = routingHealth?.providers || [];
  const activeProvidersCount = providers.filter((p) => p.is_enabled).length;
  const healthyKeysTotal = healthProviders.reduce((s, p) => s + (p.healthy_credentials || 0), 0);
  const enabledModelsCount = allModels.filter((m) => m.is_enabled).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Providers & Models"
        description="Configure Gemini, Groq, and OpenAI adapters, AES-256-GCM credentials, and verified catalog models."
        actions={
          <Button size="sm" onClick={handleOpenAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>Add Provider</span>
          </Button>
        }
      />

      <TimetableStrip>
        <TimetableCell
          label="Registered Providers"
          tag="ADAPTERS"
          loading={isProvidersLoading}
          value={providers.length}
          subtext={`${activeProvidersCount} enabled for routing`}
        />
        <TimetableCell
          label="Active Pool Keys"
          tag="VAULT"
          loading={isProvidersLoading}
          value={`${healthyKeysTotal} / ${allCredentials.length}`}
          tone={healthyKeysTotal > 0 ? 'ok' : 'warn'}
          subtext="Healthy upstream secrets"
        />
        <TimetableCell
          label="Enabled Models"
          tag="CATALOG"
          loading={isProvidersLoading}
          value={`${enabledModelsCount} / ${allModels.length}`}
          subtext="Available for alias routing"
        />
        <TimetableCell
          label="Secret Encryption"
          tag="AT REST"
          value="AES-256-GCM"
          tone="route"
          subtext="Secrets masked on all endpoints"
        />
      </TimetableStrip>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="providers" className="gap-2">
            <Server className="h-3.5 w-3.5" />
            <span>Upstream Providers ({providers.length})</span>
          </TabsTrigger>
          <TabsTrigger value="credentials" className="gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            <span>API Credentials ({allCredentials.length})</span>
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-2">
            <Boxes className="h-3.5 w-3.5" />
            <span>Model Catalog ({allModels.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          {isProvidersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No upstream providers registered"
              description="Connect Google Gemini, Groq, or OpenAI to establish your routing pool."
              actionLabel="Add Provider"
              onAction={handleOpenAdd}
            />
          ) : (
            <div className="rounded border border-border bg-card divide-y divide-border overflow-hidden">
              {providers.map((p) => {
                const summary = healthProviders.find((hp) => hp.id === p.id);
                const credCount = allCredentials.filter((c) => c.provider_id === p.id).length;
                const healthyCount = summary?.healthy_credentials ?? credCount;
                const modelCount = allModels.filter((m) => m.provider_id === p.id).length;
                const isDiscovering = discoverMutation.isPending && discoverMutation.variables === p.id;
                const status = !p.is_enabled ? 'disabled' : summary?.status || (credCount > 0 ? 'healthy' : 'degraded');

                return (
                  <div
                    key={p.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 py-4 sm:px-5 hover:bg-muted/25 transition-colors"
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-background font-mono text-xs font-bold text-foreground">
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground">{p.display_name}</h3>
                          <code className="font-mono text-[11px] text-muted-foreground">{p.name}</code>
                          <StatusBadge status={status} />
                        </div>
                        {p.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                          <span>Endpoint: {p.base_url || 'Default SDK URL'}</span>
                          <span>Keys: {healthyCount}/{credCount} healthy</span>
                          <span>Models: {modelCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleJumpToProviderTab('credentials', p.id)}
                        className="h-8 gap-1.5"
                      >
                        <KeyRound className="h-3 w-3" />
                        <span>Keys ({credCount})</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleJumpToProviderTab('models', p.id)}
                        className="h-8 gap-1.5"
                      >
                        <Boxes className="h-3 w-3" />
                        <span>Models ({modelCount})</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDiscovering}
                        onClick={() => discoverMutation.mutate(p.id)}
                        className="h-8 gap-1.5"
                        title="Fetch upstream model catalog"
                      >
                        <Sparkles className={`h-3 w-3 ${isDiscovering ? 'animate-spin text-route' : ''}`} />
                        <span>{isDiscovering ? 'Syncing...' : 'Sync Models'}</span>
                      </Button>

                      <div className="flex items-center gap-2 border-l border-border pl-2.5">
                        <Switch
                          checked={p.is_enabled}
                          onCheckedChange={() =>
                            updateMutation.mutate({
                              id: p.id,
                              payload: { is_enabled: !p.is_enabled },
                            })
                          }
                          aria-label={`Enable ${p.display_name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(p)}
                          aria-label={`Edit ${p.display_name}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingProvider(p)}
                          className="hover:text-status-err"
                          aria-label={`Delete ${p.display_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="credentials">
          <CredentialsPanel
            providers={providers}
            providerFilter={providerFilter}
            onProviderFilterChange={(val) => {
              setProviderFilter(val);
              const next = { tab: 'credentials' };
              if (val) next.provider = val;
              setSearchParams(next, { replace: true });
            }}
          />
        </TabsContent>

        <TabsContent value="models">
          <ModelsPanel
            providers={providers}
            providerFilter={providerFilter}
            onProviderFilterChange={(val) => {
              setProviderFilter(val);
              const next = { tab: 'models' };
              if (val) next.provider = val;
              setSearchParams(next, { replace: true });
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Add / Edit Provider Modal */}
      <Dialog
        open={isAddModalOpen || !!editingProvider}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingProvider(null);
          resetForm();
        }}
        title={editingProvider ? `Edit ${editingProvider.display_name}` : 'Add Upstream Provider'}
        description={
          editingProvider
            ? 'Modify display metadata, custom HTTPS host, or availability.'
            : 'Register an upstream adapter matching the gateway registry (gemini, groq, openai).'
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editingProvider && (
            <div className="space-y-1.5">
              <label htmlFor="prov-name" className="text-xs font-medium text-foreground block">
                Adapter Identifier <span className="text-status-err">*</span>
              </label>
              <Input
                id="prov-name"
                placeholder="gemini, groq, or openai"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="prov-display" className="text-xs font-medium text-foreground block">
              Display Name <span className="text-status-err">*</span>
            </label>
            <Input
              id="prov-display"
              placeholder="Google Gemini"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="prov-desc" className="text-xs font-medium text-foreground block">
              Description (Optional)
            </label>
            <Input
              id="prov-desc"
              placeholder="Primary low-latency or reasoning upstream provider"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="prov-url" className="text-xs font-medium text-foreground block">
              Base URL Override (Optional)
            </label>
            <Input
              id="prov-url"
              placeholder="Leave blank for official SDK endpoint"
              value={formBaseUrl}
              onChange={(e) => setFormBaseUrl(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <span className="text-xs font-medium">Provider Enabled</span>
              <p className="text-[11px] text-muted-foreground">
                Disabled providers are excluded from all routing candidate sets.
              </p>
            </div>
            <Switch checked={formIsEnabled} onCheckedChange={setFormIsEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingProvider(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editingProvider ? 'Save Changes' : 'Register Provider'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deletingProvider}
        onClose={() => setDeletingProvider(null)}
        title="Delete Provider?"
        description={`Delete '${deletingProvider?.display_name}'? Linked credentials and catalog models will also be permanently deleted.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeletingProvider(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deletingProvider && deleteMutation.mutate(deletingProvider.id)}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Provider'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
export default Providers;
