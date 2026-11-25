import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';

import { keysApi } from '../api/keys';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { TimetableStrip, TimetableCell } from '../components/ui/Timetable';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { formatDate } from '../lib/utils';

export function ApiKeys() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState(null);
  const [revokingKey, setRevokingKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState('python');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const [formLabel, setFormLabel] = useState('');
  const [formRpm, setFormRpm] = useState('60');
  const [formExpiresAt, setFormExpiresAt] = useState('');

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['gatewayKeys'],
    queryFn: keysApi.listKeys,
  });

  const createMutation = useMutation({
    mutationFn: keysApi.createKey,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gatewayKeys'] });
      setIsAddOpen(false);
      setCreatedKeyData(data);
      setFormLabel('');
      setFormRpm('60');
      setFormExpiresAt('');
      toast.success('Gateway API key created');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to create API key');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: keysApi.revokeKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gatewayKeys'] });
      toast.success('Gateway API key revoked');
      setRevokingKey(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to revoke key');
    },
  });

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const parsedRpm = parseInt(formRpm, 10);
    if (!parsedRpm || parsedRpm < 1 || parsedRpm > 10000) {
      toast.error('Rate limit RPM must be between 1 and 10,000');
      return;
    }

    const payload = {
      label: formLabel.trim(),
      rate_limit_rpm: parsedRpm,
    };
    if (formExpiresAt) {
      payload.expires_at = new Date(formExpiresAt).toISOString();
    }
    createMutation.mutate(payload);
  };

  const handleCopyRawKey = (key) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    toast.info('Secret key copied to clipboard');
  };

  const originUrl = window.location.origin;

  const snippets = {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_AXLY_GATEWAY_KEY",
    base_url="${originUrl}/v1"
)

response = client.chat.completions.create(
    model="fast",
    messages=[{"role": "user", "content": "Summarize failover status."}]
)
print(response.choices[0].message.content)`,
    curl: `curl -X POST ${originUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_AXLY_GATEWAY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "fast",
    "messages": [{"role": "user", "content": "Summarize failover status."}]
  }'`,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_AXLY_GATEWAY_KEY",
  baseURL: "${originUrl}/v1",
});

const completion = await client.chat.completions.create({
  model: "smart",
  messages: [{ role: "user", content: "Explain circuit breakers." }],
});
console.log(completion.choices[0].message.content);`,
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(snippets[activeSnippet]);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
    toast.info('Integration snippet copied');
  };

  const activeCount = keys.filter((k) => k.is_active).length;
  const revokedCount = keys.filter((k) => !k.is_active).length;
  const avgRpm =
    activeCount > 0
      ? Math.round(
          keys.filter((k) => k.is_active).reduce((acc, k) => acc + (k.rate_limit_rpm || 60), 0) / activeCount
        )
      : 60;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gateway API Keys"
        description="Client bearer tokens authenticating against POST /v1/chat/completions with sliding-window RPM rate limits."
        actions={
          <>
            <Link to="/api-docs">
              <Button variant="outline" size="sm" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                <span>API Reference</span>
              </Button>
            </Link>
            <Button size="sm" onClick={() => setIsAddOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>Create Key</span>
            </Button>
          </>
        }
      />

      <TimetableStrip>
        <TimetableCell
          label="Total Issued Keys"
          tag="VAULT"
          loading={isLoading}
          value={keys.length}
          subtext="SHA-256 one-way digested"
        />
        <TimetableCell
          label="Active Keys"
          tag="AUTH"
          loading={isLoading}
          value={activeCount}
          tone="ok"
          subtext="Permitted for /v1 inference"
        />
        <TimetableCell
          label="Revoked Keys"
          tag="DENIED"
          loading={isLoading}
          value={revokedCount}
          tone={revokedCount > 0 ? 'warn' : 'default'}
          subtext="Rejected with 401 Unauthorized"
        />
        <TimetableCell
          label="Mean RPM Ceiling"
          tag="THROTTLE"
          loading={isLoading}
          value={`${avgRpm} RPM`}
          subtext="Upstream TPM enforced per credential"
        />
      </TimetableStrip>

      {/* Keys Table */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Issued Client Tokens</h2>
            <p className="text-xs text-muted-foreground">
              Secrets are revealed once upon issuance; manage per-provider TPM ceilings under{' '}
              <Link to="/providers?tab=credentials" className="text-route hover:underline">
                Provider Credentials
              </Link>.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-status-ok" />
            <span>Plaintext keys never persisted</span>
          </span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Key}
              title="No Gateway API Keys issued"
              description="Generate a client API key so your applications or the Playground can invoke /v1/chat/completions."
              actionLabel="Create First Key"
              onAction={() => setIsAddOpen(true)}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Key Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rate Limit</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-semibold text-foreground">{k.label}</TableCell>
                  <TableCell>
                    <code className="rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
                      {k.key_preview}
                    </code>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={k.is_active ? 'active' : 'revoked'} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-foreground">
                    {k.rate_limit_rpm} RPM
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {k.expires_at ? formatDate(k.expires_at) : 'No expiry'}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDate(k.created_at)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {k.last_used_at ? formatDate(k.last_used_at) : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    {k.is_active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevokingKey(k)}
                        className="h-7 text-xs text-muted-foreground hover:text-status-err gap-1"
                        aria-label={`Revoke ${k.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Revoke</span>
                      </Button>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Client SDK Quickstart */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">OpenAI-Compatible Quickstart</h2>
            <p className="text-xs text-muted-foreground">
              Drop-in authentication using any routing alias (<code className="font-mono text-foreground">fast</code>, <code className="font-mono text-foreground">smart</code>, <code className="font-mono text-foreground">coding</code>) or explicit model identifier.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-border bg-surface-subtle p-0.5">
              {[
                { id: 'python', label: 'Python SDK' },
                { id: 'curl', label: 'cURL' },
                { id: 'node', label: 'Node.js' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveSnippet(t.id)}
                  className={`rounded-sm px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                    activeSnippet === t.id
                      ? 'bg-card text-foreground border border-border'
                      : 'border border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleCopySnippet} className="gap-1.5">
              {copiedSnippet ? <Check className="h-3.5 w-3.5 text-status-ok" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>
        <pre className="p-4 sm:p-5 bg-background font-mono text-xs text-muted-foreground overflow-x-auto leading-relaxed">
          <code>{snippets[activeSnippet]}</code>
        </pre>
      </section>

      {/* Create Key Dialog */}
      <Dialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Generate Gateway API Key"
        description="Issue a client authentication key bound to a per-minute request quota."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="key-label" className="text-xs font-medium text-foreground block">
              Key Label <span className="text-status-err">*</span>
            </label>
            <Input
              id="key-label"
              placeholder="e.g. Production Web Backend"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="key-rpm" className="text-xs font-medium text-foreground block">
                Rate Limit (RPM) <span className="text-status-err">*</span>
              </label>
              <Input
                id="key-rpm"
                type="number"
                min={1}
                max={10000}
                value={formRpm}
                onChange={(e) => setFormRpm(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">Allowed range: 1 to 10,000 requests/min.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="key-expiry" className="text-xs font-medium text-foreground block">
                Expiration (Optional)
              </label>
              <Input
                id="key-expiry"
                type="datetime-local"
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Leave blank for non-expiring token.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
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
        title="API Key Issued"
        description="Copy your secret token now. Only its SHA-256 digest is stored on the server."
      >
        <div className="space-y-4">
          <div className="rounded border border-status-warn/40 bg-status-warn/10 p-3 flex items-start gap-2.5 text-xs text-status-warn">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Store this raw key immediately in your secrets manager. Closing this dialog permanently clears it from memory.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label="Generated API key secret"
              value={createdKeyData?.raw_key || ''}
              className="font-mono text-xs select-all"
            />
            <Button
              type="button"
              onClick={() => handleCopyRawKey(createdKeyData?.raw_key)}
              className="gap-1.5 shrink-0"
            >
              {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>

          <div className="flex justify-end pt-3 border-t border-border">
            <Button onClick={() => setCreatedKeyData(null)}>Done</Button>
          </div>
        </div>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={!!revokingKey}
        onClose={() => setRevokingKey(null)}
        title="Revoke Gateway API Key?"
        description={`Applications authenticating with '${revokingKey?.label}' will immediately receive HTTP 401 Unauthorized responses.`}
      >
        <div className="flex justify-end gap-2 pt-2">
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
export default ApiKeys;
