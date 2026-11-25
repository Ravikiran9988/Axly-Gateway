import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Edit, Trash2, Eye, Wrench, Zap } from 'lucide-react';

import { modelsApi } from '../../api/models';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { Skeleton } from '../ui/Skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/Toast';

export function ModelsPanel({ providers = [], providerFilter = '', onProviderFilterChange }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [deletingModel, setDeletingModel] = useState(null);

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

  const { data: allModels = [], isLoading: isModelsLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.listModels(),
  });

  const createMutation = useMutation({
    mutationFn: modelsApi.createModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model registered in catalog');
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to register model'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => modelsApi.updateModel(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model catalog updated');
      setEditingModel(null);
      resetForm();
    },
    onError: (err) => toast.error(err.message || 'Failed to update model'),
  });

  const deleteMutation = useMutation({
    mutationFn: modelsApi.deleteModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model removed from catalog');
      setDeletingModel(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to delete model'),
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

  const filteredModels = allModels.filter((m) => {
    if (providerFilter && m.provider_id !== providerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!m.model_identifier.toLowerCase().includes(q) && !m.display_name.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-card px-3.5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="w-full sm:w-64">
            <Input
              aria-label="Search models"
              placeholder="Search model name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="model-provider-filter" className="font-mono text-[11px] uppercase text-muted-foreground">
              Provider
            </label>
            <Select
              id="model-provider-filter"
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
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {filteredModels.length} models
          </span>
          <Button size="sm" onClick={handleOpenAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>Register Model</span>
          </Button>
        </div>
      </div>

      {isModelsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filteredModels.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No models registered"
          description={
            searchQuery || providerFilter
              ? 'No models match your active search or provider filter.'
              : 'Use Discover Models on the Providers tab or register a model manually.'
          }
          actionLabel="Register Model"
          onAction={handleOpenAdd}
        />
      ) : (
        <section className="rounded border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Context</TableHead>
                <TableHead className="text-right">Pricing / 1M</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.map((model) => {
                const provider = providers.find((p) => p.id === model.provider_id);
                const caps = model.capabilities || {};
                return (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div className="font-semibold text-foreground">{model.display_name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{model.model_identifier}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {provider ? provider.display_name : 'Provider'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {(model.context_window || 8192).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                      In ${(model.input_price_per_million || 0).toFixed(2)} · Out ${(model.output_price_per_million || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {caps.vision && (
                          <Badge variant="route" className="text-[10px] gap-1">
                            <Eye className="h-2.5 w-2.5" />
                            Vision
                          </Badge>
                        )}
                        {caps.tool_calling && (
                          <Badge variant="success" className="text-[10px] gap-1">
                            <Wrench className="h-2.5 w-2.5" />
                            Tools
                          </Badge>
                        )}
                        {caps.streaming && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Zap className="h-2.5 w-2.5" />
                            SSE
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={model.is_enabled}
                        onCheckedChange={() =>
                          updateMutation.mutate({
                            id: model.id,
                            payload: { is_enabled: !model.is_enabled },
                          })
                        }
                        aria-label={`Toggle ${model.display_name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(model)}
                          aria-label={`Edit ${model.display_name}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingModel(model)}
                          className="hover:text-status-err"
                          aria-label={`Delete ${model.display_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

      {/* Add / Edit Model Modal */}
      <Dialog
        open={isAddOpen || !!editingModel}
        onClose={() => {
          setIsAddOpen(false);
          setEditingModel(null);
          resetForm();
        }}
        title={editingModel ? 'Edit Catalog Model' : 'Register Model'}
        description="Configure model capabilities, context window, and catalog pricing rates ($/1M tokens)."
      >
        <form onSubmit={editingModel ? handleEditSubmit : handleCreateSubmit} className="space-y-4">
          {!editingModel && (
            <div className="space-y-1.5">
              <label htmlFor="mod-provider" className="text-xs font-medium text-foreground block">
                Provider <span className="text-status-err">*</span>
              </label>
              <Select
                id="mod-provider"
                value={formProviderId}
                onChange={(e) => setFormProviderId(e.target.value)}
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
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="mod-id" className="text-xs font-medium text-foreground block">
                Model Identifier <span className="text-status-err">*</span>
              </label>
              <Input
                id="mod-id"
                placeholder="gpt-4o-mini, gemini-2.5-flash"
                value={formIdentifier}
                onChange={(e) => setFormIdentifier(e.target.value)}
                disabled={!!editingModel}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="mod-name" className="text-xs font-medium text-foreground block">
                Display Name <span className="text-status-err">*</span>
              </label>
              <Input
                id="mod-name"
                placeholder="Gemini 2.5 Flash"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="mod-ctx" className="text-xs font-medium text-foreground block">
                Context Window
              </label>
              <Input
                id="mod-ctx"
                type="number"
                min={1024}
                value={formContextWindow}
                onChange={(e) => setFormContextWindow(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mod-in" className="text-xs font-medium text-foreground block">
                Input $/1M
              </label>
              <Input
                id="mod-in"
                type="number"
                step="0.0001"
                value={formInputPrice}
                onChange={(e) => setFormInputPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mod-out" className="text-xs font-medium text-foreground block">
                Output $/1M
              </label>
              <Input
                id="mod-out"
                type="number"
                step="0.0001"
                value={formOutputPrice}
                onChange={(e) => setFormOutputPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded border border-border p-3">
            <div className="font-mono text-[11px] uppercase text-muted-foreground">Capabilities</div>
            <div className="flex items-center justify-between text-xs">
              <span>Vision / Multimodal</span>
              <Switch checked={capVision} onCheckedChange={setCapVision} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Function / Tool Calling</span>
              <Switch checked={capToolCalling} onCheckedChange={setCapToolCalling} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Streaming Responses</span>
              <Switch checked={capStreaming} onCheckedChange={setCapStreaming} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <span className="text-xs font-medium">Enabled in Catalog</span>
              <p className="text-[11px] text-muted-foreground">
                Disabled models are rejected on direct requests and skipped by aliases.
              </p>
            </div>
            <Switch checked={formIsEnabled} onCheckedChange={setFormIsEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
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

      {/* Delete Model Confirmation */}
      <Dialog
        open={!!deletingModel}
        onClose={() => setDeletingModel(null)}
        title="Remove Model?"
        description={`Remove '${deletingModel?.display_name}' from the catalog? Alias rules targeting this model will fail over.`}
      >
        <div className="flex justify-end gap-2 pt-2">
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
