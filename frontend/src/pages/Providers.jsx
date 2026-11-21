import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Server,
  Plus,
  RefreshCw,
  KeyRound,
  Boxes,
  ExternalLink,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';

import { providersApi } from '../api/providers';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function Providers() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [deletingProvider, setDeletingProvider] = useState(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formIsEnabled, setFormIsEnabled] = useState(true);

  // Queries
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: providersApi.createProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      addToast('Provider created successfully', 'success');
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to create provider', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => providersApi.updateProvider(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      addToast('Provider updated successfully', 'success');
      setEditingProvider(null);
      resetForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to update provider', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: providersApi.deleteProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      addToast('Provider deleted successfully', 'success');
      setDeletingProvider(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to delete provider', 'error');
    },
  });

  const discoverMutation = useMutation({
    mutationFn: providersApi.discoverModels,
    onSuccess: (models) => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      addToast(`Discovered and registered ${models.length} models`, 'success');
    },
    onError: (err) => {
      addToast(err.message || 'Model discovery failed', 'error');
    },
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
          display_name: formDisplayName,
          description: formDescription || null,
          base_url: formBaseUrl || null,
          is_enabled: formIsEnabled,
        },
      });
    } else {
      createMutation.mutate({
        name: formName.trim().toLowerCase(),
        display_name: formDisplayName.trim(),
        description: formDescription || null,
        base_url: formBaseUrl || null,
        is_enabled: formIsEnabled,
      });
    }
  };

  const handleToggleEnable = (p) => {
    updateMutation.mutate({
      id: p.id,
      payload: { is_enabled: !p.is_enabled },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Providers"
          description="Connect, configure, and monitor upstream LLM providers (Google Gemini, Groq, and OpenAI)."
        />
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>Add Provider</span>
        </Button>
      </div>

      {/* Providers Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <Server className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold">No Providers Configured</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Register Gemini, Groq, or OpenAI to start routing requests.
          </p>
          <Button onClick={handleOpenAdd} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Provider</span>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => {
            const isDiscovering = discoverMutation.isPending && discoverMutation.variables === p.id;
            return (
              <Card key={p.id} className="relative flex flex-col justify-between transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">{p.display_name}</CardTitle>
                        <CardDescription className="text-xs font-mono">{p.name}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={p.is_enabled ? 'success' : 'secondary'} className="text-[10px]">
                      {p.is_enabled ? 'ACTIVE' : 'DISABLED'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {p.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                  )}

                  <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Base URL:</span>
                      <span className="truncate max-w-[160px] text-foreground">
                        {p.base_url || 'Default SDK URL'}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Config Schema:</span>
                      <span className="text-foreground">Custom JSON</span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/credentials?provider=${p.id}`}
                        className="flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Credentials</span>
                      </Link>
                      <span>•</span>
                      <Link
                        to={`/models?provider=${p.id}`}
                        className="flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <Boxes className="h-3.5 w-3.5" />
                        <span>Models</span>
                      </Link>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Discover/Sync Models"
                        disabled={isDiscovering}
                        onClick={() => discoverMutation.mutate(p.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Sparkles className={`h-3.5 w-3.5 ${isDiscovering ? 'animate-spin text-primary' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit Provider"
                        onClick={() => handleOpenEdit(p)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete Provider"
                        onClick={() => setDeletingProvider(p)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
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

      {/* Add / Edit Dialog */}
      <Dialog
        open={isAddModalOpen || !!editingProvider}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingProvider(null);
          resetForm();
        }}
        title={editingProvider ? 'Edit Provider' : 'Add New Provider'}
        description={
          editingProvider
            ? `Update configuration for provider '${editingProvider.name}'.`
            : 'Register a new upstream provider adapter.'
        }
      >
        <form onSubmit={handleSave} className="space-y-4 mt-2">
          {!editingProvider && (
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Identifier (slug) <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. gemini, groq, openai"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Lowercase identifier matching the adapter registry.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Display Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Google Gemini"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Description (Optional)
            </label>
            <Input
              placeholder="e.g. Google DeepMind multimodal generative models"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Custom Base URL (Optional)
            </label>
            <Input
              placeholder="e.g. https://api.openai.com/v1"
              value={formBaseUrl}
              onChange={(e) => setFormBaseUrl(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Leave blank to use default upstream endpoints.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <span className="text-xs font-medium">Provider Enabled</span>
              <p className="text-[11px] text-muted-foreground">
                Disabled providers are excluded from all routing candidates.
              </p>
            </div>
            <Switch checked={formIsEnabled} onCheckedChange={setFormIsEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
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
              {editingProvider ? 'Save Changes' : 'Create Provider'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingProvider}
        onClose={() => setDeletingProvider(null)}
        title="Delete Provider?"
        description={`Are you sure you want to delete '${deletingProvider?.display_name}'? Associated credentials and model catalog entries will also be permanently removed.`}
      >
        <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
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
