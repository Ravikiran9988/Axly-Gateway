import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Code2,
  Terminal,
} from 'lucide-react';

import { keysApi } from '../api/keys';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

export function ApiKeys() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState(null);
  const [revokingKey, setRevokingKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(null);

  // Form states
  const [formLabel, setFormLabel] = useState('');
  const [formRpm, setFormRpm] = useState('');

  // Query keys
  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['gatewayKeys'],
    queryFn: keysApi.listKeys,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: keysApi.createKey,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gatewayKeys'] });
      setIsAddOpen(false);
      setCreatedKeyData(data);
      setFormLabel('');
      setFormRpm('');
    },
    onError: (err) => {
      addToast(err.message || 'Failed to create API key', 'error');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: keysApi.revokeKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gatewayKeys'] });
      addToast('Gateway API key revoked successfully', 'success');
      setRevokingKey(null);
    },
    onError: (err) => {
      addToast(err.message || 'Failed to revoke key', 'error');
    },
  });

  const handleCopyRawKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    addToast('Raw API key copied to clipboard', 'info');
  };

  const handleCopySnippet = (snippet, lang) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(lang);
    setTimeout(() => setCopiedSnippet(null), 2000);
    addToast('Usage snippet copied to clipboard', 'info');
  };

  const pythonSnippet = `from openai import OpenAI

# Initialize client using your self-hosted AXLY Gateway
client = OpenAI(
    api_key="YOUR_AXLY_GATEWAY_KEY",
    base_url="http://localhost:8000/v1"
)

# Route through the "fast" alias with automatic failover
response = client.chat.completions.create(
    model="fast",
    messages=[
        {"role": "user", "content": "Explain Python decorators"}
    ]
)

print(response.choices[0].message.content)`;

  const curlSnippet = `curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_AXLY_GATEWAY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "fast",
    "messages": [
      {"role": "user", "content": "Explain Python decorators"}
    ]
  }'`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Gateway API Keys"
          description="Client authentication tokens for accessing the OpenAI-compatible /v1/chat/completions endpoint."
        />
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>Create New Key</span>
        </Button>
      </div>

      {/* Keys Table */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-sm font-semibold">Active Gateway Keys</CardTitle>
          <CardDescription className="text-xs">
            Only SHA-256 hashes of client keys are stored in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-[11px] font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Label</th>
                  <th className="px-5 py-3">Key Preview</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Rate Limit</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Last Used</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ) : keys.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No Gateway API Keys created yet. Click "Create New Key" above to generate a client token.
                    </td>
                  </tr>
                ) : (
                  keys.map((k) => (
                    <tr key={k.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-semibold text-foreground">
                        {k.label}
                      </td>
                      <td className="px-5 py-3 font-mono font-medium text-muted-foreground">
                        {k.key_preview || 'axly-...'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={k.is_active ? 'success' : 'secondary'} className="text-[10px]">
                          {k.is_active ? 'ACTIVE' : 'REVOKED'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-muted-foreground">
                        {k.rate_limit_rpm ? `${k.rate_limit_rpm} RPM` : 'Unlimited'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground font-mono">
                        {new Date(k.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground font-mono">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {k.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokingKey(k)}
                            className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Revoke</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Usage Examples Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Python Example */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Code2 className="h-4 w-4 text-primary" />
                <span>Python SDK (OpenAI Compatible)</span>
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopySnippet(pythonSnippet, 'python')}
              className="h-7 text-xs gap-1"
            >
              {copiedSnippet === 'python' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>Copy</span>
            </Button>
          </CardHeader>
          <CardContent className="p-4 bg-muted/20 font-mono text-xs overflow-x-auto">
            <pre className="text-muted-foreground">{pythonSnippet}</pre>
          </CardContent>
        </Card>

        {/* cURL Example */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-emerald-500" />
                <span>cURL Request</span>
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopySnippet(curlSnippet, 'curl')}
              className="h-7 text-xs gap-1"
            >
              {copiedSnippet === 'curl' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>Copy</span>
            </Button>
          </CardHeader>
          <CardContent className="p-4 bg-muted/20 font-mono text-xs overflow-x-auto">
            <pre className="text-muted-foreground">{curlSnippet}</pre>
          </CardContent>
        </Card>
      </div>

      {/* Create Key Dialog */}
      <Dialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Generate Gateway API Key"
        description="Creates a secure client authentication key with optional rate limit."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({
              label: formLabel.trim(),
              rate_limit_rpm: formRpm ? parseInt(formRpm, 10) : null,
            });
          }}
          className="space-y-4 mt-2"
        >
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Key Label <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Production Web Backend, Staging Agent Service"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Rate Limit RPM (Optional)
            </label>
            <Input
              type="number"
              placeholder="e.g. 120 (leave blank for unlimited)"
              value={formRpm}
              onChange={(e) => setFormRpm(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !formLabel.trim()}>
              {createMutation.isPending ? 'Generating...' : 'Generate Key'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* One-Time Display Secret Dialog */}
      <Dialog
        open={!!createdKeyData}
        onClose={() => setCreatedKeyData(null)}
        title="Gateway API Key Generated"
        description="Please copy and save your secret key immediately. For security reasons, you will not be able to view it again."
      >
        <div className="space-y-4 mt-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Save this key in your secrets manager or environment variables. AXLY Gateway only stores a secure SHA-256 hash.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={createdKeyData?.raw_key || ''}
              className="font-mono text-xs select-all bg-card"
            />
            <Button
              type="button"
              onClick={() => handleCopyRawKey(createdKeyData?.raw_key)}
              className="gap-1.5 shrink-0"
            >
              {copiedKey ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
            </Button>
          </div>

          <div className="flex justify-end pt-3 border-t">
            <Button onClick={() => setCreatedKeyData(null)}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Revoke Key Confirmation Dialog */}
      <Dialog
        open={!!revokingKey}
        onClose={() => setRevokingKey(null)}
        title="Revoke Gateway API Key?"
        description={`Are you sure you want to revoke '${revokingKey?.label}'? Any client applications using this key will immediately receive 401 Unauthorized errors.`}
      >
        <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
          <Button variant="outline" onClick={() => setRevokingKey(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={revokeMutation.isPending}
            onClick={() => revokingKey && revokeMutation.mutate(revokingKey.id)}
          >
            {revokeMutation.isPending ? 'Revoking...' : 'Revoke Key'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
