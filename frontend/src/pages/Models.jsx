import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Cpu,
  Eye,
  Wrench,
  Zap,
  Sparkles,
} from 'lucide-react';

import { modelsApi } from '../api/models';
import { providersApi } from '../api/providers';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function Models() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const providerFilter = searchParams.get('provider') || '';
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [deletingModel, setDeletingModel] = useState(null);

  // Form states
  const [formProviderId, setFormProviderId] = useState('');
  const [formIdentifier, setFormIdentifier] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formContextWindow, setFormContextWindow] = useState(8192);
  const [formInputPrice, setFormInputPrice] = useState(0.0);
  const [formOutputPrice, setFormOutputPrice] = useState(0.0);
  const [formIsEnabled, setFormIsEnabled] = useState(true);
  const [capVision, setCapVision] = useState(false);
  const [capToolCalling, setCapToolCalling] = useState(true);
  const [capStreaming, setCapStreaming] = useState(true);

  // Queries
  const { data: models = [], isLoading: isModelsLoading } = useQuery({
    queryKey: ['models', providerFilter],
    queryFn: () => modelsApi.listModels(providerFilter || null),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: providersApi.listProviders,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: modelsApi.createModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      addToast('Model registered successfully in catalog', 'success');
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to register model', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => modelsApi.updateModel(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      addToast('Model updated successfully', 'success');
      setEditingModel(null);
      resetForm();
    },
    onError: (err) => {
      addToast(err.message || 'Failed to update model', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: modelsApi.deleteModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      addToast('Model removed from catalog', 'success');
      setDeletingModel(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to delete model', 'error');
    },
  });

  const resetForm = () => {
    setFormProviderId('');
    setFormIdentifier('');
    setFormDisplayName('');
    setFormContextWindow(8192);
    setFormInputPrice(0.0);
    setFormOutputPrice(0.0);
    setFormIsEnabled(true);
    setCapVision(false);
    setCapToolCalling(true);
    setCapStreaming(true);
  };

  const handleOpenAdd = () => {
    resetForm();
    if (providers.length > 0) {
      setFormProviderId(providerFilter || providers[0].id);
    }
    setIsAddOpen(true);
  };

  const handleOpenEdit = (m) => {
    setEditingModel(m);
    setFormProviderId(m.provider_id);
    setFormIdentifier(m.model_identifier);
    setFormDisplayName(m.display_name);
    setFormContextWindow(m.context_window || 8192);
    setFormInputPrice(m.input_price_per_million || 0.0);
    setFormOutputPrice(m.output_price_per_million || 0.0);
    setFormIsEnabled(m.is_enabled);
    setCapVision(!!m.capabilities?.vision);
    setCapToolCalling(m.capabilities?.tool_calling !== false);
    setCapStreaming(m.capabilities?.streaming !== false);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      provider_id: formProviderId,
      model_identifier: formIdentifier.trim(),
      display_name: formDisplayName.trim(),
      context_window: parseInt(formContextWindow, 10) || 8192,
      input_price_per_million: parseFloat(formInputPrice) || 0.0,
      output_price_per_million: parseFloat(formOutputPrice) || 0.0,
      is_enabled: formIsEnabled,
      capabilities: {
        chat: true,
        vision: capVision,
        tool_calling: capToolCalling,
        streaming: capStreaming,
      },
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingModel) return;
    updateMutation.mutate({
      id: editingModel.id,
      payload: {
        display_name: formDisplayName.trim(),
        context_window: parseInt(formContextWindow, 10) || 8192,
        input_price_per_million: parseFloat(formInputPrice) || 0.0,
        output_price_per_million: parseFloat(formOutputPrice) || 0.0,
        is_enabled: formIsEnabled,
        capabilities: {
          chat: true,
          vision: capVision,
          tool_calling: capToolCalling,
          streaming: capStreaming,
        },
      },
    });
  };

  const handleToggleEnable = (m) => {
    updateMutation.mutate({
      id: m.id,
      payload: { is_enabled: !m.is_enabled },
    });
  };

  // Filter models
  const filteredModels = models.filter((m) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = m.model_identifier.toLowerCase().includes(q);
      const matchName = m.display_name.toLowerCase().includes(q);
      if (!matchId && !matchName) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Models Catalog"
          description="Catalog of verified LLM models, capability flags, token context limits, and pricing rates."
        />
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>Register Model</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-sm text-xs">
        <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
          <Input
            placeholder="Search by model or identifier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-xs"
          >
          </Input>
        </div>

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

        <div className="ml-auto text-muted-foreground font-mono">
          {filteredModels.length} models listed
        </div>
      </div>

      {/* Models Grid */}
      {isModelsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredModels.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <Boxes className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold">No Models in Catalog</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchQuery || providerFilter
              ? 'No models match your search query.'
              : 'Register custom models or use "Discover Models" on the Providers page.'}
          </p>
          <Button onClick={handleOpenAdd} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            <span>Register Model</span>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredModels.map((model) => {
            const provider = providers.find((p) => p.id === model.provider_id);
            const caps = model.capabilities || {};

            return (
              <Card key={model.id} className="transition-shadow hover:shadow-sm flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">
                        {model.display_name}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono truncate text-muted-foreground">
                        {model.model_identifier}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={model.is_enabled}
                      onCheckedChange={() => handleToggleEnable(model)}
                      title={model.is_enabled ? 'Enabled in catalog' : 'Disabled'}
                    />
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {provider ? provider.display_name : 'Provider'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {(model.context_window || 8192).toLocaleString()} ctx
                    </Badge>
                    {caps.vision && (
                      <Badge variant="outline" className="text-[10px] text-indigo-600 dark:text-indigo-400 gap-1">
                        <Eye className="h-3 w-3" />
                        <span>Vision</span>
                      </Badge>
                    )}
                    {caps.tool_calling && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 gap-1">
                        <Wrench className="h-3 w-3" />
                        <span>Tools</span>
                      </Badge>
                    )}
                    {caps.streaming && (
                      <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 gap-1">
                        <Zap className="h-3 w-3" />
                        <span>Stream</span>
                      </Badge>
                    )}
                  </div>

                  {/* Pricing Rate */}
                  <div className="rounded-md bg-muted/30 p-2 text-[11px] font-mono text-muted-foreground flex justify-between">
                    <span>
                      In: ${model.input_price_per_million ? model.input_price_per_million.toFixed(2) : '0.00'}/1M
                    </span>
                    <span>
                      Out: ${model.output_price_per_million ? model.output_price_per_million.toFixed(2) : '0.00'}/1M
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <span className="text-[10px] text-muted-foreground">
                      Updated {new Date(model.updated_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(model)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingModel(model)}
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

      {/* Add / Edit Model Dialog */}
      <Dialog
        open={isAddOpen || !!editingModel}
        onClose={() => {
          setIsAddOpen(false);
          setEditingModel(null);
          resetForm();
        }}
        title={editingModel ? 'Edit Model' : 'Register New Model'}
        description="Configure context limits, pricing, and capability badges for this catalog entry."
      >
        <form onSubmit={editingModel ? handleEditSubmit : handleCreateSubmit} className="space-y-4 mt-2">
          {!editingModel && (
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
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Model Identifier (API name) <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. gpt-4o-mini, gemini-1.5-flash, llama-3.1-8b-instant"
              value={formIdentifier}
              onChange={(e) => setFormIdentifier(e.target.value)}
              disabled={!!editingModel}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Display Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. GPT-4o Mini"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Context Window (tokens)
            </label>
            <Input
              type="number"
              min="1024"
              value={formContextWindow}
              onChange={(e) => setFormContextWindow(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Input Price ($/1M tokens)
              </label>
              <Input
                type="number"
                step="0.0001"
                value={formInputPrice}
                onChange={(e) => setFormInputPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Output Price ($/1M tokens)
              </label>
              <Input
                type="number"
                step="0.0001"
                value={formOutputPrice}
                onChange={(e) => setFormOutputPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <span className="text-xs font-medium block">Capabilities</span>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Vision / Multimodal Support</span>
              <Switch checked={capVision} onCheckedChange={setCapVision} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Function / Tool Calling</span>
              <Switch checked={capToolCalling} onCheckedChange={setCapToolCalling} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Streaming Chunks</span>
              <Switch checked={capStreaming} onCheckedChange={setCapStreaming} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <span className="text-xs font-medium">Model Enabled</span>
              <p className="text-[11px] text-muted-foreground">
                Disabled models are excluded from client requests and alias routing.
              </p>
            </div>
            <Switch checked={formIsEnabled} onCheckedChange={setFormIsEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddOpen(false);
                setEditingModel(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editingModel ? 'Save Changes' : 'Register Model'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingModel}
        onClose={() => setDeletingModel(null)}
        title="Remove Model from Catalog?"
        description={`Are you sure you want to remove '${deletingModel?.display_name}'? It will no longer be available for alias candidate routing.`}
      >
        <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
          <Button variant="outline" onClick={() => setDeletingModel(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deletingModel && deleteMutation.mutate(deletingModel.id)}
          >
            {deleteMutation.isPending ? 'Removing...' : 'Remove Model'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
