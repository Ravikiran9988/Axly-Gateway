import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Send,
  Square,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  BookOpen,
  KeyRound,
  AlertCircle,
  Terminal,
  MessageSquare,
} from 'lucide-react';
import { routingApi } from '../api/routing';
import { modelsApi } from '../api/models';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

export function Playground() {
  const { addToast } = useToast();
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [gatewayApiKey, setGatewayApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedModelOrAlias, setSelectedModelOrAlias] = useState('smart');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a concise, precise technical AI assistant routed through AXLY Gateway.'
  );
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1.0);
  const [isStreaming, setIsStreaming] = useState(true);
  const [activeViewTab, setActiveViewTab] = useState('thread');

  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [executionMetadata, setExecutionMetadata] = useState(null);
  const [wireTrace, setWireTrace] = useState(null);

  const { data: aliases = [] } = useQuery({
    queryKey: ['aliases'],
    queryFn: routingApi.listAliases,
  });

  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.listModels,
  });

  const activeAliases = useMemo(() => aliases.filter((a) => a.is_enabled), [aliases]);
  const enabledModels = useMemo(() => models.filter((m) => m.is_enabled), [models]);

  useEffect(() => {
    if (activeAliases.length > 0) {
      const hasCurrent =
        activeAliases.some((a) => a.alias_name === selectedModelOrAlias) ||
        enabledModels.some((m) => m.model_identifier === selectedModelOrAlias);
      if (!hasCurrent) {
        setSelectedModelOrAlias(activeAliases[0].alias_name);
      }
    } else if (enabledModels.length > 0 && selectedModelOrAlias === 'smart') {
      const hasSmart = enabledModels.some((m) => m.model_identifier === 'smart');
      if (!hasSmart) {
        setSelectedModelOrAlias(enabledModels[0].model_identifier);
      }
    }
  }, [activeAliases, enabledModels, selectedModelOrAlias]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const requestPreview = useMemo(() => {
    const apiMessages = [];
    if (systemPrompt.trim()) {
      apiMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    messages.forEach((m) => {
      if (!m.isError) apiMessages.push({ role: m.role, content: m.content });
    });
    if (inputPrompt.trim()) {
      apiMessages.push({ role: 'user', content: inputPrompt.trim() });
    }
    return {
      model: selectedModelOrAlias,
      messages: apiMessages.length > 0 ? apiMessages : [{ role: 'user', content: '<prompt>' }],
      temperature: Number(temperature),
      max_tokens: Number(maxTokens),
      top_p: Number(topP),
      stream: Boolean(isStreaming),
    };
  }, [selectedModelOrAlias, systemPrompt, messages, inputPrompt, temperature, maxTokens, topP, isStreaming]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      addToast('Generation aborted by operator', 'info');
    }
  };

  const handleClear = () => {
    setMessages([]);
    setExecutionMetadata(null);
    setWireTrace(null);
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const handleSend = async () => {
    if (!inputPrompt.trim() || isLoading) return;
    if (!gatewayApiKey.trim()) {
      addToast('Enter an active AXLY Gateway API key (axly_...) to execute requests.', 'error');
      return;
    }

    const userMsg = { role: 'user', content: inputPrompt.trim() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInputPrompt('');
    setIsLoading(true);
    setExecutionMetadata(null);

    const apiMessages = [];
    if (systemPrompt.trim()) {
      apiMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    nextHistory.forEach((m) => {
      if (!m.isError) apiMessages.push({ role: m.role, content: m.content });
    });

    const payload = {
      model: selectedModelOrAlias,
      messages: apiMessages,
      temperature: Number(temperature),
      max_tokens: Number(maxTokens),
      top_p: Number(topP),
      stream: isStreaming,
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startTime = performance.now();

    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gatewayApiKey.trim()}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const axlyHeaders = {
        requestId: response.headers.get('X-Axly-Request-Id'),
        provider: response.headers.get('X-Axly-Provider'),
        model: response.headers.get('X-Axly-Model'),
        attemptCount: response.headers.get('X-Axly-Attempt-Count'),
        failover: response.headers.get('X-Axly-Failover'),
      };

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        setWireTrace({
          status: response.status,
          headers: axlyHeaders,
          request: payload,
          response: errJson,
        });
        throw new Error(errJson?.error?.message || errJson?.detail || `HTTP Error ${response.status}`);
      }

      if (isStreaming) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let assistantContent = '';
        let lastChunkModel = axlyHeaders.model || selectedModelOrAlias;
        let lastChunkId = axlyHeaders.requestId || '';
        const collectedChunks = [];

        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') {
                break;
              }

              try {
                const chunk = JSON.parse(dataStr);
                if (chunk.error) {
                  throw new Error(chunk.error?.message || JSON.stringify(chunk.error));
                }
                if (collectedChunks.length < 40) {
                  collectedChunks.push(chunk);
                }
                if (chunk.id) lastChunkId = chunk.id;
                if (chunk.model) lastChunkModel = chunk.model;

                const delta = chunk.choices?.[0]?.delta?.content || '';
                if (delta) {
                  assistantContent += delta;
                  setMessages((prev) => {
                    const copy = [...prev];
                    copy[copy.length - 1] = {
                      role: 'assistant',
                      content: assistantContent,
                    };
                    return copy;
                  });
                }
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) {
                  continue;
                }
                throw parseErr;
              }
            }
          }
        }

        const endTime = performance.now();
        setExecutionMetadata({
          requestId: lastChunkId || `stream-${Date.now()}`,
          latencyMs: Math.round(endTime - startTime),
          model: lastChunkModel,
          provider: axlyHeaders.provider || 'routed-stream',
          failover: axlyHeaders.failover,
          attemptCount: axlyHeaders.attemptCount,
          isStream: true,
        });
        setWireTrace({
          status: response.status,
          headers: axlyHeaders,
          request: payload,
          response: {
            stream: true,
            sample_chunks_captured: collectedChunks.length,
            final_text_length: assistantContent.length,
            first_and_last:
              collectedChunks.length > 1
                ? [collectedChunks[0], collectedChunks[collectedChunks.length - 1]]
                : collectedChunks,
          },
        });
      } else {
        const data = await response.json();
        const endTime = performance.now();

        const assistantMsg = data.choices?.[0]?.message?.content || 'No content returned.';
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantMsg }]);

        setExecutionMetadata({
          requestId: axlyHeaders.requestId || data.id,
          latencyMs: Math.round(endTime - startTime),
          model: axlyHeaders.model || data.model,
          usage: data.usage,
          provider: axlyHeaders.provider || data.provider || 'auto-routed',
          failover: axlyHeaders.failover,
          attemptCount: axlyHeaders.attemptCount,
          isStream: false,
        });
        setWireTrace({
          status: response.status,
          headers: axlyHeaders,
          request: payload,
          response: data,
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: err.message,
            isError: true,
          },
        ]);
        addToast(err.message, 'error');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Playground"
        description="Execute live OpenAI-compatible completions through your routing policies, observe SSE streams, and inspect raw gateway wire payloads."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/api-docs">
              <Button variant="outline" size="sm">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                API Docs
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={messages.length === 0 && !executionMetadata}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear Thread
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Inference Workbench & Wire Inspector */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded border border-border bg-card flex flex-col min-h-[540px] max-h-[calc(100vh-14.5rem)] overflow-hidden">
            {/* Workbench Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle px-4 py-2.5">
              <Tabs value={activeViewTab} onValueChange={setActiveViewTab} variant="segmented">
                <TabsList>
                  <TabsTrigger value="thread">
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                    Response Thread
                  </TabsTrigger>
                  <TabsTrigger value="wire">
                    <Terminal className="h-3.5 w-3.5 mr-1.5" />
                    Wire Inspector
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <Badge variant="outline" className="font-mono text-[10px]">
                  TARGET: {selectedModelOrAlias}
                </Badge>
                <Badge variant={isStreaming ? 'route' : 'secondary'} className="font-mono text-[10px]">
                  {isStreaming ? 'SSE STREAM' : 'SYNC JSON'}
                </Badge>
              </div>
            </div>

            {activeViewTab === 'thread' ? (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-4">
                    <div className="h-10 w-10 rounded border border-border bg-surface-subtle flex items-center justify-center text-muted-foreground">
                      <Terminal className="h-5 w-5" />
                    </div>
                    <h2 className="mt-3 text-sm font-semibold text-foreground">
                      Ready to Route Inference
                    </h2>
                    <p className="mt-1.5 max-w-md text-xs text-muted-foreground leading-relaxed">
                      Enter a valid Gateway API key (<code className="font-mono text-foreground">axly_...</code>) in the control rail, choose an active alias or catalog model, and run a prompt to verify routing, failover, and streaming behavior.
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const isStreamingLast =
                      isLoading && idx === messages.length - 1 && msg.role === 'assistant';
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'rounded border px-4 py-3',
                          msg.isError
                            ? 'border-status-err/40 bg-status-err/10 text-foreground'
                            : isUser
                              ? 'border-border bg-surface-subtle'
                              : 'border-border bg-card'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/60">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-block h-2 w-2 rounded-[1px]',
                                msg.isError
                                  ? 'bg-status-err'
                                  : isUser
                                    ? 'bg-muted-foreground'
                                    : 'bg-route'
                              )}
                            />
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {msg.isError
                                ? 'GATEWAY ERROR'
                                : isUser
                                  ? 'USER PROMPT'
                                  : 'ASSISTANT OUTPUT'}
                            </span>
                            {isStreamingLast && (
                              <span className="font-mono text-[10px] uppercase tracking-wider text-route animate-pulse">
                                STREAMING...
                              </span>
                            )}
                          </div>

                          {!isUser && msg.content && (
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.content, `msg-${idx}`)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Copy message output"
                            >
                              {copiedIdx === `msg-${idx}` ? (
                                <>
                                  <Check className="h-3 w-3 text-status-ok" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copy
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <div
                          className={cn(
                            'text-sm leading-relaxed whitespace-pre-wrap break-words',
                            msg.isError && 'font-mono text-xs text-status-err'
                          )}
                        >
                          {msg.content ||
                            (isStreamingLast ? (
                              <span className="inline-block h-4 w-2 bg-route animate-pulse align-middle" />
                            ) : null)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      POST /v1/chat/completions — Request Payload
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(JSON.stringify(requestPreview, null, 2), 'req-json')}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {copiedIdx === 'req-json' ? <Check className="h-3 w-3 text-status-ok" /> : <Copy className="h-3 w-3" />}
                      Copy JSON
                    </button>
                  </div>
                  <pre className="rounded border border-border bg-rail p-3.5 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto">
                    {JSON.stringify(requestPreview, null, 2)}
                  </pre>
                </div>

                <div>
                  <span className="block mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Latest Response Frame & Diagnostic Headers
                  </span>
                  {wireTrace ? (
                    <pre className="rounded border border-border bg-rail p-3.5 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto">
                      {JSON.stringify(wireTrace, null, 2)}
                    </pre>
                  ) : (
                    <div className="rounded border border-dashed border-border bg-surface-subtle p-4 text-xs text-muted-foreground">
                      Send a completion request to capture live response payloads and <code className="font-mono text-foreground">X-Axly-*</code> routing headers.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prompt Input Dock */}
            <div className="border-t border-border bg-surface-subtle p-3.5">
              <div className="flex gap-2.5 items-end">
                <textarea
                  aria-label="Prompt message"
                  placeholder="Enter a prompt to test gateway routing... (Enter sends, Shift+Enter inserts newline)"
                  className="flex-1 min-h-[68px] max-h-[160px] rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={isLoading}
                />
                {isLoading ? (
                  <Button type="button" variant="destructive" onClick={handleStop} className="shrink-0 h-10 px-4">
                    <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSend}
                    disabled={!inputPrompt.trim()}
                    className="shrink-0 h-10 px-4"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Rule-Divided Execution Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-border rounded bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-4 py-3 min-w-0">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Request ID
              </span>
              <span className="mt-1 block font-mono text-xs font-medium text-foreground truncate">
                {executionMetadata?.requestId || '—'}
              </span>
            </div>
            <div className="px-4 py-3 min-w-0">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Resolved Model
              </span>
              <span className="mt-1 block font-mono text-xs font-medium text-route truncate">
                {executionMetadata?.model || '—'}
              </span>
            </div>
            <div className="px-4 py-3 min-w-0">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Round-Trip Latency
              </span>
              <span className="mt-1 block font-mono text-xs font-medium text-foreground tabular-nums">
                {executionMetadata ? `${executionMetadata.latencyMs} ms` : '—'}
              </span>
            </div>
            <div className="px-4 py-3 min-w-0">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Token Accounting
              </span>
              <span className="mt-1 block font-mono text-xs font-medium text-foreground tabular-nums truncate">
                {executionMetadata?.usage
                  ? `${executionMetadata.usage.prompt_tokens} in / ${executionMetadata.usage.completion_tokens} out`
                  : executionMetadata?.isStream
                    ? 'SSE Streamed'
                    : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Parameter Control Rail */}
        <aside className="lg:col-span-4 rounded border border-border bg-card divide-y divide-border">
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="pg-api-key"
                className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Gateway API Key
              </label>
              <Link
                to="/api-keys"
                className="font-mono text-[10px] text-route hover:underline"
              >
                Manage Keys
              </Link>
            </div>
            <div className="relative">
              <Input
                id="pg-api-key"
                type={showKey ? 'text' : 'password'}
                placeholder="axly_..."
                value={gatewayApiKey}
                onChange={(e) => setGatewayApiKey(e.target.value)}
                className="pr-9 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label={showKey ? 'Hide Gateway API Key' : 'Show Gateway API Key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!gatewayApiKey && (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-snug">
                <AlertCircle className="h-3.5 w-3.5 text-status-warn shrink-0 mt-0.5" />
                <span>
                  Playground calls authenticate via <code className="font-mono text-foreground">/v1/chat/completions</code> using a client key, not the admin session.
                </span>
              </p>
            )}
          </div>

          <div className="p-4 space-y-3">
            <div>
              <label
                htmlFor="pg-target"
                className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground mb-1.5"
              >
                Alias or Model Target
              </label>
              <Select
                id="pg-target"
                value={selectedModelOrAlias}
                onChange={(e) => setSelectedModelOrAlias(e.target.value)}
                className="font-mono text-xs"
              >
                {activeAliases.length > 0 && (
                  <optgroup label="Routing Aliases">
                    {activeAliases.map((alias) => (
                      <option key={alias.id} value={alias.alias_name}>
                        {alias.alias_name} ({alias.candidates?.length || 0} candidates)
                      </option>
                    ))}
                  </optgroup>
                )}
                {enabledModels.length > 0 && (
                  <optgroup label="Direct Catalog Models">
                    {enabledModels.map((model) => (
                      <option key={model.id} value={model.model_identifier}>
                        {model.model_identifier}
                      </option>
                    ))}
                  </optgroup>
                )}
                {activeAliases.length === 0 && enabledModels.length === 0 && (
                  <option value={selectedModelOrAlias}>{selectedModelOrAlias}</option>
                )}
              </Select>
            </div>

            <div>
              <label
                htmlFor="pg-system"
                className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground mb-1.5"
              >
                System Instruction
              </label>
              <textarea
                id="pg-system"
                rows={3}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Optional system instruction..."
                className="w-full rounded border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              />
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label htmlFor="pg-stream" className="text-xs font-semibold text-foreground block">
                  SSE Streaming
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Token-by-token incremental output
                </span>
              </div>
              <Switch
                id="pg-stream"
                checked={isStreaming}
                onCheckedChange={setIsStreaming}
                aria-label="Enable SSE Streaming"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="pg-temp" className="font-medium text-foreground">
                  Temperature
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {Number(temperature).toFixed(1)}
                </span>
              </div>
              <input
                id="pg-temp"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="pg-max-tokens" className="font-medium text-foreground">
                  Max Tokens
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {maxTokens}
                </span>
              </div>
              <input
                id="pg-max-tokens"
                type="range"
                min="64"
                max="4096"
                step="64"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="pg-top-p" className="font-medium text-foreground">
                  Top P
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {Number(topP).toFixed(2)}
                </span>
              </div>
              <input
                id="pg-top-p"
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Playground;
