import React, { useState } from 'react';
import {
  BookOpen,
  Code,
  Copy,
  Check,
  Zap,
  Shield,
  Layers,
  Terminal,
  Server,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

export function ApiDocs() {
  const [activeTab, setActiveTab] = useState('curl');
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const originUrl = window.location.origin;

  const curlCode = `curl -X POST "${originUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer axly-YOUR_GATEWAY_API_KEY" \\
  -d '{
    "model": "fast",
    "messages": [
      { "role": "system", "content": "You are a helpful AI assistant." },
      { "role": "user", "content": "Explain circuit breakers in distributed systems." }
    ],
    "temperature": 0.7,
    "max_tokens": 1024,
    "stream": false
  }'`;

  const pythonCode = `import openai

client = openai.OpenAI(
    base_url="${originUrl}/v1",
    api_key="axly-YOUR_GATEWAY_API_KEY",
)

# Use routing aliases: "fast", "smart", "coding", "cheap"
# Or explicit model IDs: "groq/llama-3.3-70b-versatile", "gemini/gemini-2.5-flash"
response = client.chat.completions.create(
    model="fast",
    messages=[
        {"role": "system", "content": "You are a concise engineering lead."},
        {"role": "user", "content": "What are the benefits of LLM gateway failover?"},
    ],
    temperature=0.7,
)

print(response.choices[0].message.content)`;

  const streamingPythonCode = `import openai

client = openai.OpenAI(
    base_url="${originUrl}/v1",
    api_key="axly-YOUR_GATEWAY_API_KEY",
)

stream = client.chat.completions.create(
    model="smart",
    messages=[{"role": "user", "content": "Write a Python retry decorator."}],
    stream=True,
)

for chunk in stream:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)`;

  const nodeCode = `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${originUrl}/v1",
  apiKey: "axly-YOUR_GATEWAY_API_KEY",
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "coding",
    messages: [
      { role: "system", content: "You are an expert TypeScript architect." },
      { role: "user", content: "Provide a generic rate limiter function." },
    ],
  });

  console.log(completion.choices[0].message.content);
}

main();`;

  const getActiveCode = () => {
    switch (activeTab) {
      case 'curl':
        return curlCode;
      case 'python':
        return pythonCode;
      case 'python_stream':
        return streamingPythonCode;
      case 'node':
        return nodeCode;
      default:
        return curlCode;
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info('Code snippet copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Documentation"
        description="Complete reference for integrating client applications with the AXLY Gateway OpenAI-compatible endpoint."
      />

      {/* Overview Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary text-primary font-mono text-[10px]">
                  POST /v1/chat/completions
                </Badge>
                <Badge variant="success">OpenAI-Compatible</Badge>
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Drop-in Replacement for any OpenAI SDK or Client
              </h3>
              <p className="text-xs text-muted-foreground max-w-2xl">
                Point your existing libraries to <code className="font-mono text-foreground font-semibold">{originUrl}/v1</code>.
                AXLY Gateway handles dynamic model resolution, multi-key credential load balancing, quota cooldowns, and automatic failovers transparently.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Code Playground / Examples */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4 text-primary" />
                Integration Snippets
              </CardTitle>
              <CardDescription className="text-xs">
                Select your preferred language or client library.
              </CardDescription>
            </div>

            <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('curl')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'curl' ? 'bg-background font-semibold shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                cURL
              </button>
              <button
                onClick={() => setActiveTab('python')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'python' ? 'bg-background font-semibold shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Python SDK
              </button>
              <button
                onClick={() => setActiveTab('python_stream')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'python_stream' ? 'bg-background font-semibold shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Python Streaming
              </button>
              <button
                onClick={() => setActiveTab('node')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'node' ? 'bg-background font-semibold shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Node.js / TypeScript
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="relative rounded-lg border bg-muted/40 font-mono text-xs">
            <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/70">
              <span className="text-[11px] text-muted-foreground">
                {activeTab === 'curl' ? 'bash' : activeTab === 'node' ? 'typescript' : 'python'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => copyToClipboard(getActiveCode())}
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="p-4 overflow-x-auto text-foreground leading-relaxed">
              <code>{getActiveCode()}</code>
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Model Aliases vs Explicit Models */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Model Aliases</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Abstract high-level routing targets with automatic failover fallback chains.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="border rounded-md divide-y">
              <div className="p-2.5 flex items-center justify-between">
                <div>
                  <code className="font-bold text-primary font-mono">fast</code>
                  <p className="text-[11px] text-muted-foreground">Optimized for sub-second latency.</p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">Groq &rarr; Gemini &rarr; OpenAI</Badge>
              </div>

              <div className="p-2.5 flex items-center justify-between">
                <div>
                  <code className="font-bold text-primary font-mono">smart</code>
                  <p className="text-[11px] text-muted-foreground">High reasoning and instruction following.</p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">OpenAI &rarr; Gemini &rarr; Groq</Badge>
              </div>

              <div className="p-2.5 flex items-center justify-between">
                <div>
                  <code className="font-bold text-primary font-mono">coding</code>
                  <p className="text-[11px] text-muted-foreground">Specialized code generation & refactoring.</p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">GPT-4o &rarr; Gemini-2.5-Flash</Badge>
              </div>

              <div className="p-2.5 flex items-center justify-between">
                <div>
                  <code className="font-bold text-primary font-mono">cheap</code>
                  <p className="text-[11px] text-muted-foreground">Lowest token cost per 1M tokens.</p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">Gemini Flash &rarr; Groq Llama</Badge>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Candidate chains and priorities can be modified in real-time from the Routing configuration tab without restarting the service.
            </p>
          </CardContent>
        </Card>

        {/* Custom Transparency Headers */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Response Transparency Headers</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Every API response includes diagnostic execution headers explaining routing choices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="border rounded-md divide-y font-mono text-[11px]">
              <div className="p-2.5 flex justify-between">
                <span className="font-semibold text-foreground">X-Axly-Request-Id</span>
                <span className="text-muted-foreground">UUIDv4 tracking ID</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="font-semibold text-foreground">X-Axly-Provider</span>
                <span className="text-muted-foreground">Resolved upstream provider (e.g. groq)</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="font-semibold text-foreground">X-Axly-Model</span>
                <span className="text-muted-foreground">Actual upstream model queried</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="font-semibold text-foreground">X-Axly-Attempts</span>
                <span className="text-muted-foreground">Total failover attempts made</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="font-semibold text-foreground">X-Axly-Latency-Ms</span>
                <span className="text-muted-foreground">Total processing latency</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              If candidate 1 fails due to rate limits or timeouts, AXLY Gateway retries candidate 2 and logs the full attempt journey in Request Logs.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error Handling & HTTP Status Codes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">HTTP Status Codes & Error Semantics</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Standard HTTP error responses conforming to OpenAI error specifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <code className="font-mono font-bold text-foreground">401 Unauthorized</code>
                <Badge variant="destructive" className="text-[10px]">Auth</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Missing or invalid Gateway API key. Check <code className="font-mono">Authorization: Bearer axly-...</code>
              </p>
            </div>

            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <code className="font-mono font-bold text-foreground">400 Bad Request</code>
                <Badge variant="secondary" className="text-[10px]">Client</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Malformed JSON payload, empty messages list, or unsupported model parameter.
              </p>
            </div>

            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <code className="font-mono font-bold text-foreground">404 Not Found</code>
                <Badge variant="secondary" className="text-[10px]">Client</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Requested model or alias is not configured or disabled in AXLY Gateway catalog.
              </p>
            </div>

            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <code className="font-mono font-bold text-foreground">429 Rate Limit</code>
                <Badge variant="warning" className="text-[10px]">Throttled</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Client RPM exceeded or all eligible upstream providers are currently quota exhausted.
              </p>
            </div>

            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <code className="font-mono font-bold text-foreground">502 Bad Gateway</code>
                <Badge variant="destructive" className="text-[10px]">Upstream</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                All candidates in failover chain were exhausted due to upstream provider network errors.
              </p>
            </div>

            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between">
                <code className="font-mono font-bold text-foreground">504 Gateway Timeout</code>
                <Badge variant="destructive" className="text-[10px]">Timeout</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Upstream model failed to return a response before the configured timeout period.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
export default ApiDocs;
