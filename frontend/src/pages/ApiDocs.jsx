import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check, Terminal, ArrowRight, KeyRound } from 'lucide-react';
import { routingApi } from '../api/routing';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Switch } from '../components/ui/Switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table';

export function ApiDocs() {
  const [selectedLang, setSelectedLang] = useState('curl');
  const [streaming, setStreaming] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
  const baseUrl = `${origin}/v1`;

  const { data: aliases = [] } = useQuery({
    queryKey: ['aliases'],
    queryFn: routingApi.listAliases,
  });

  const activeAliases = useMemo(() => aliases.filter((a) => a.is_enabled), [aliases]);
  const sampleModel = activeAliases[0]?.alias_name || 'smart';

  const snippets = useMemo(
    () => ({
      curl: `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Authorization: Bearer axly_your_gateway_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${sampleModel}",
    "stream": ${streaming},
    "messages": [
      {"role": "system", "content": "Be concise and factual."},
      {"role": "user", "content": "Summarize our gateway failover architecture."}
    ]
  }'`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="axly_your_gateway_key",
)

response = client.chat.completions.create(
    model="${sampleModel}",
    stream=${streaming ? 'True' : 'False'},
    messages=[
        {"role": "system", "content": "Be concise and factual."},
        {"role": "user", "content": "Summarize our gateway failover architecture."},
    ],
)
${streaming ? 'for chunk in response:\n    print(chunk.choices[0].delta.content or "", end="")' : 'print(response.choices[0].message.content)'}`,
      javascript: `const res = await fetch("${baseUrl}/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer axly_your_gateway_key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${sampleModel}",
    stream: ${streaming},
    messages: [
      { role: "user", content: "Summarize our gateway failover architecture." }
    ],
  }),
});`,
    }),
    [baseUrl, sampleModel, streaming]
  );

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="API Reference"
        description="OpenAI-compatible REST contract, alias targeting, response telemetry headers, and deterministic failover error codes."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/api-keys">
              <Button variant="outline" size="sm">
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                Manage Keys
              </Button>
            </Link>
            <Link to="/playground">
              <Button size="sm">
                <Terminal className="h-3.5 w-3.5 mr-1.5" />
                Test in Playground
              </Button>
            </Link>
          </div>
        }
      />

      {/* Endpoint & Auth Contract */}
      <section className="rounded border border-border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-xs">
            <Badge variant="route" className="font-mono text-[10px]">
              POST
            </Badge>
            <code className="font-semibold text-foreground">{baseUrl}/chat/completions</code>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(`${baseUrl}/chat/completions`, 'endpoint')}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {copiedId === 'endpoint' ? <Check className="h-3.5 w-3.5 text-status-ok" /> : <Copy className="h-3.5 w-3.5" />}
            Copy Endpoint
          </button>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-prose">
          Drop-in replacement for OpenAI chat completions. Authenticate requests with a Gateway Client Key (<code className="font-mono text-xs text-foreground">Authorization: Bearer axly_...</code>) and target any configured routing alias or catalog model identifier in the <code className="font-mono text-xs text-foreground">model</code> field.
        </p>
      </section>

      {/* Interactive SDK Snippets */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-2.5">
          <Tabs value={selectedLang} onValueChange={setSelectedLang} variant="segmented">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="python">Python SDK</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript fetch</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="docs-stream"
                checked={streaming}
                onCheckedChange={setStreaming}
                aria-label="Toggle streaming example"
              />
              <label htmlFor="docs-stream" className="font-mono text-[11px] text-muted-foreground">
                stream: {String(streaming)}
              </label>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(snippets[selectedLang], 'snippet')}
            >
              {copiedId === 'snippet' ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5 text-status-ok" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy Code
                </>
              )}
            </Button>
          </div>
        </div>

        <pre className="p-4 sm:p-5 font-mono text-xs leading-relaxed text-foreground bg-rail overflow-x-auto">
          {snippets[selectedLang]}
        </pre>
      </section>

      {/* Active Routing Aliases Preview */}
      {activeAliases.length > 0 && (
        <section className="rounded border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 sm:px-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Configured Model Targets</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active routing aliases available for immediate use in the <code className="font-mono text-foreground">model</code> parameter.
              </p>
            </div>
            <Link to="/routing" className="font-mono text-[11px] text-route hover:underline">
              Edit aliases <ArrowRight className="inline h-3 w-3 ml-0.5" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {activeAliases.map((alias) => (
              <div
                key={alias.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
              >
                <code className="font-mono font-semibold text-foreground">{alias.alias_name}</code>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {alias.candidates?.length || 0} fallback candidates configured
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Diagnostic Response Headers */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">Gateway Diagnostic Headers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Metadata headers returned alongside completions for tracing failover behavior.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Header</TableHead>
              <TableHead>Example</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono text-xs text-route">X-Axly-Request-Id</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">req_8c1f...</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Unique gateway trace ID queryable inside Request Logs.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono text-xs text-route">X-Axly-Provider</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">groq</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Upstream provider adapter that fulfilled the final completion.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono text-xs text-route">X-Axly-Model</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">llama-3.3-70b-versatile</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Resolved upstream catalog model identifier after alias expansion.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono text-xs text-route">X-Axly-Attempt-Count</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">2</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Total execution attempts across credential rotation and failover hops.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono text-xs text-route">X-Axly-Failover</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">true</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Indicates whether the gateway switched away from the first-priority target.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* HTTP Status Codes */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">HTTP Status &amp; Retry Semantics</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead>Gateway Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono font-semibold text-status-ok">200 OK</TableCell>
              <TableCell className="text-xs text-foreground">Completion succeeded</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Returns OpenAI payload or SSE stream and commits token ledger metrics.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono font-semibold text-status-warn">401 Unauthorized</TableCell>
              <TableCell className="text-xs text-foreground">Invalid, revoked, or expired key</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Rejected at gateway edge before consuming upstream quotas.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono font-semibold text-status-warn">429 Too Many Requests</TableCell>
              <TableCell className="text-xs text-foreground">Gateway key RPM limit exceeded</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Client exceeded configured requests-per-minute quota; retry after window reset.
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono font-semibold text-status-err">502 / 503 Unavailable</TableCell>
              <TableCell className="text-xs text-foreground">All failover candidates exhausted</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Failing credentials enter cooldown; circuit breakers evaluate threshold trips.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export default ApiDocs;
