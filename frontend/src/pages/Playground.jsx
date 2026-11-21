import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PlaySquare,
  Send,
  Square,
  Trash2,
  Copy,
  Check,
  Cpu,
  Clock,
  Coins,
  ShieldCheck,
  Zap,
  Sliders,
  AlertCircle,
  Sparkles,
  Bot,
  User,
} from 'lucide-react';

import { routingApi } from '../api/routing';
import { modelsApi } from '../api/models';
import { apiClient } from '../api/client';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { useToast } from '../components/ui/Toast';

export function Playground() {
  const { addToast } = useToast();

  // Model & Alias options
  const { data: aliases = [] } = useQuery({
    queryKey: ['routingAliases'],
    queryFn: routingApi.listAliases,
  });

  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.listModels(),
  });

  // Playground state
  const [selectedModelOrAlias, setSelectedModelOrAlias] = useState('fast');
  const [systemPrompt, setSystemPrompt] = useState('You are AXLY, a helpful and precise AI assistant.');
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am ready. You can test intelligent routing and multi-provider failover by sending a message.',
    },
  ]);

  // Parameters
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1.0);
  const [isStreaming, setIsStreaming] = useState(true);

  // In-flight execution state
  const [isLoading, setIsLoading] = useState(false);
  const [executionMetadata, setExecutionMetadata] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const abortControllerRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Set default model once aliases load
  useEffect(() => {
    if (aliases.length > 0 && !selectedModelOrAlias) {
      setSelectedModelOrAlias(aliases[0].alias_name);
    }
  }, [aliases, selectedModelOrAlias]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      addToast('Generation cancelled', 'info');
    }
  };

  const handleClearChat = () => {
    handleCancel();
    setMessages([]);
    setExecutionMetadata(null);
  };

  const handleCopyText = (text, index = null) => {
    navigator.clipboard.writeText(text);
    if (index !== null) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
    addToast('Copied to clipboard', 'info');
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const userText = userInput.trim();
    setUserInput('');

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsLoading(true);
    setExecutionMetadata(null);

    // Prepare OpenAI-compatible payload
    const requestMessages = [];
    if (systemPrompt.trim()) {
      requestMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    requestMessages.push(...newMessages.filter((m) => m.role === 'user' || m.role === 'assistant'));

    const payload = {
      model: selectedModelOrAlias,
      messages: requestMessages,
      temperature: parseFloat(temperature),
      max_tokens: parseInt(maxTokens, 10),
      top_p: parseFloat(topP),
      stream: isStreaming,
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startTime = performance.now();

    try {
      const token = apiClient.getToken();
      const headers = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || errJson?.detail || `HTTP Error ${response.status}`);
      }

      if (isStreaming) {
        // Handle Server-Sent Events stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let assistantContent = '';
        let lastChunkModel = selectedModelOrAlias;
        let lastChunkId = '';

        // Add initial empty assistant bubble
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete trailing fragment in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments & keepalive

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') {
                break;
              }

              try {
                const chunk = JSON.parse(dataStr);
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
                // Ignore parse errors on partial chunks
              }
            }
          }
        }

        const endTime = performance.now();
        setExecutionMetadata({
          requestId: lastChunkId || `stream-${Date.now()}`,
          latencyMs: Math.round(endTime - startTime),
          model: lastChunkModel,
          isStream: true,
        });
      } else {
        // Handle standard JSON response
        const data = await response.json();
        const endTime = performance.now();

        const assistantMsg = data.choices?.[0]?.message?.content || 'No content received.';
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantMsg }]);

        setExecutionMetadata({
          requestId: data.id,
          latencyMs: Math.round(endTime - startTime),
          model: data.model,
          usage: data.usage,
          provider: data.provider || 'auto-routed',
          isStream: false,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Handled cleanly
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Gateway Error:** ${err.message}`,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Playground"
          description="Interactive LLM test console. Executes queries through real gateway aliases, provider adapters, and failovers."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearChat}
          className="gap-1.5 h-9"
          disabled={messages.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear Chat</span>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Chat Thread (8 cols) */}
        <div className="lg:col-span-8 flex flex-col h-[700px] rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={idx}
                  className={`flex gap-3 text-xs leading-relaxed ${
                    isAssistant ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {isAssistant && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`relative group max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                      isAssistant
                        ? msg.isError
                          ? 'bg-destructive/10 text-destructive border border-destructive/20'
                          : 'bg-muted/50 text-foreground border'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {isAssistant && (
                      <button
                        onClick={() => handleCopyText(msg.content, idx)}
                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground"
                        title="Copy message"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {!isAssistant && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3 text-xs justify-start">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl bg-muted/50 px-4 py-3 border text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] ml-1">Streaming response...</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Execution Metadata Status Bar */}
          {executionMetadata && (
            <div className="flex flex-wrap items-center justify-between border-t bg-muted/20 px-4 py-2 text-[11px] font-mono text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-foreground font-semibold">
                  <Cpu className="h-3 w-3 text-primary" />
                  <span>{executionMetadata.model}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{executionMetadata.latencyMs}ms</span>
                </span>
                {executionMetadata.usage && (
                  <span className="flex items-center gap-1">
                    <Coins className="h-3 w-3" />
                    <span>{executionMetadata.usage.total_tokens} tokens</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>ID: {executionMetadata.requestId?.slice(0, 14)}...</span>
                <button
                  onClick={() => handleCopyText(executionMetadata.requestId)}
                  className="hover:text-foreground p-0.5"
                  title="Copy Request ID"
                >
                  {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}

          {/* Prompt Input Form */}
          <form onSubmit={handleSubmit} className="border-t p-3 bg-card">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Type a message or prompt to test..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                disabled={isLoading}
                className="flex-1 text-xs h-10 shadow-none border"
              />
              {isLoading ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancel}
                  className="h-10 px-4 gap-1.5 text-xs"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button type="submit" disabled={!userInput.trim()} className="h-10 px-4 gap-1.5 text-xs">
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Right: Parameters & System Configuration (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center justify-between">
                <span>Model & Parameters</span>
                <Sliders className="h-3.5 w-3.5" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {/* Model or Alias Selector */}
              <div>
                <label className="font-semibold block mb-1.5 text-foreground">
                  Model / Alias
                </label>
                <Select
                  value={selectedModelOrAlias}
                  onChange={(e) => setSelectedModelOrAlias(e.target.value)}
                >
                  <optgroup label="Routing Aliases (Recommended)">
                    {aliases.map((a) => (
                      <option key={a.id} value={a.alias_name}>
                        Alias: {a.alias_name} ({a.candidates?.length || 0} candidates)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Direct Catalog Models">
                    {models.map((m) => (
                      <option key={m.id} value={m.model_identifier}>
                        {m.display_name} ({m.model_identifier})
                      </option>
                    ))}
                  </optgroup>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Aliases automatically fall back across healthy providers.
                </p>
              </div>

              {/* Streaming Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-2.5">
                <div>
                  <span className="font-medium block text-xs">Stream Responses</span>
                  <span className="text-[10px] text-muted-foreground">Server-Sent Events (SSE)</span>
                </div>
                <Switch checked={isStreaming} onCheckedChange={setIsStreaming} />
              </div>

              {/* Temperature */}
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-medium text-foreground">Temperature</label>
                  <span className="font-mono text-muted-foreground">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Max Tokens */}
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-medium text-foreground">Max Tokens</label>
                  <span className="font-mono text-muted-foreground">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="64"
                  max="4096"
                  step="64"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Top P */}
              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-medium text-foreground">Top P</label>
                  <span className="font-mono text-muted-foreground">{topP}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="font-semibold block mb-1 text-foreground">System Prompt</label>
                <textarea
                  rows={3}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Set instructions for the assistant..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
