# AXLY Gateway

> **One API. Intelligent Routing. Reliable Failover.**  
> *The self-hosted LLM gateway for your AI applications.*

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-336791.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 Overview

**AXLY Gateway** is a high-performance, self-hosted LLM gateway and reverse proxy designed for resilient AI infrastructure. It acts as a drop-in replacement for OpenAI API endpoints (`/v1/chat/completions`), intelligently load balancing traffic across multiple providers (Google Gemini, Groq, OpenAI), managing API credential pools with automatic cooldowns, and executing zero-downtime failovers when upstream providers experience rate limits (HTTP 429), server errors (HTTP 5xx), or network timeouts.

---

## 🚀 Key Capabilities

### 1. Unified OpenAI-Compatible Endpoint
- Seamlessly query any upstream provider through a single standard endpoint: `POST /v1/chat/completions`.
- Full support for both synchronous JSON responses and real-time Server-Sent Events (SSE) streaming.
- Complete fidelity with standard OpenAI parameters: `messages`, `temperature`, `top_p`, `max_tokens`, `stream`, `presence_penalty`, `frequency_penalty`.

### 2. Intelligent Routing & Automatic Failover Engine
- **Model Aliases:** Define abstract aliases (`fast`, `smart`, `coding`, `cheap`) mapping to prioritized candidate chains.
- **Direct Model Routing:** Pass explicit provider/model targets (e.g. `groq/llama-3.3-70b-versatile`, `gemini/gemini-2.5-flash`, `openai/gpt-4o`).
- **Multi-Credential Pools:** Assign multiple API keys per provider with priority weights, rate limits, and health tracking.
- **Quota Groups:** Link sibling keys sharing billing accounts to prevent redundant quota exhaustion attempts.
- **Adaptive Cooldowns:** Automatic exponential backoff with jitter and respect for upstream `Retry-After` headers.
- **Distributed Circuit Breakers:** Protect downstream callers from cascading failures (`CLOSED`, `HALF_OPEN`, `OPEN`).
- **Request correlation:** Responses include `X-Request-ID` for correlation with request and routing logs.

### 3. Professional Admin Dashboard
- **Application Shell:** Responsive collapsible sidebar, breadcrumbs, notification system, and seamless light/dark theme toggle.
- **Overview Dashboard:** Live KPI cards (Requests, Success Rate, Tokens, Estimated Cost, Latency, Failovers) and Recharts time-series charts.
- **Providers & Credentials:** Add/edit/test upstream integrations with authenticated AES-256-GCM envelope encryption and masked key previews.
- **Models Catalog:** Registry of supported models with context window limits, token pricing, and capability switches (Vision, Tools, Streaming).
- **Routing Engine Visualizer:** Drag-and-drop / priority reordering of failover candidate chains and profile management.
- **Fallback & Recovery:** Live circuit breaker states with transition history logs, quota group status, and credential health overrides.
- **Interactive Playground:** Real SSE streaming chat interface with model/alias selector, parameter sliders, abort controllers, and execution metadata.
- **Gateway Client Keys:** Self-service issuance of client API keys (`axly-...`) with SHA-256 one-way hashing, PostgreSQL-backed per-key request limits, and copyable SDK snippets.
- **Request Logs:** Filterable, paginated audit logs with search, status codes, CSV export, and step-by-step routing journey inspector.
- **Observability & Analytics:** Aggregate telemetry dashboards with P50/P95/P99 latency distribution and provider breakdown.
- **Health Monitor:** Subsystem diagnostics for PostgreSQL pools, encryption, auth services, upstream providers, and auto-refresh intervals.
- **Settings & Security:** Instance configuration, routing defaults, content logging toggle, and administrator credential management.
- **API Documentation:** Interactive developer guide with live cURL, Python, and TypeScript SDK examples.

---

## 🏗️ Architecture

```text
                                 ┌─────────────────────────────────────────┐
                                 │       Client Application / SDK          │
                                 │ (OpenAI Python / Node SDK, LangChain)   │
                                 └────────────────────┬────────────────────┘
                                                      │  POST /v1/chat/completions
                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                  AXLY GATEWAY                                    │
│                                                                                  │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌────────────────────┐  │
│  │   Gateway Key Auth    │──▶│   Model Resolution    │──▶│ Candidate Selector │  │
│  │  (SHA-256 / Rate RPM) │   │ (Alias / Explicit ID) │   │  (Priority Chains) │  │
│  └───────────────────────┘   └───────────────────────┘   └─────────┬──────────┘  │
│                                                                    │             │
│  ┌─────────────────────────────────────────────────────────────────┴──────────┐  │
│  │                            Failover Executor Engine                        │  │
│  │                                                                            │  │
│  │   ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────┐   │  │
│  │   │ Credential Selector │──▶│   Circuit Breaker   │──▶│ Quota Manager  │   │  │
│  │   │ (Priority & Health) │   │ (CLOSED/HALF/OPEN)  │   │(Cooldown/Track)│   │  │
│  │   └─────────────────────┘   └─────────────────────┘   └────────────────┘   │  │
│  └─────────────────────────────────────┬──────────────────────────────────────┘  │
└────────────────────────────────────────┼─────────────────────────────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
      ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
      │   Google Gemini     │ │        Groq         │ │       OpenAI        │
      │  (Gemini 2.5 Flash, │ │  (Llama 3.3 70B,    │ │  (GPT-4o, GPT-4o    │
      │   Gemini 1.5 Pro)   │ │   Mixtral 8x7B)     │ │   mini, o1-preview) │
      └─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
- **Framework:** FastAPI, Uvicorn, Pydantic v2
- **Database & ORM:** PostgreSQL, SQLAlchemy 2.0 (AsyncIO), Alembic
- **Security & Crypto:** AES-256-GCM envelope encryption, Argon2id password hashing, PyJWT
- **HTTP Engine:** HTTPX async client with streaming SSE support

### Frontend
- **Framework:** React 18, Vite, JavaScript
- **Styling:** Tailwind CSS, shadcn/ui design patterns, Lucide React
- **State & Routing:** TanStack Query (React Query v5), React Router v6
- **Data Visualization:** Recharts

---

## 🚦 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 15+

### 1. Clone & Setup Environment

```bash
git clone https://github.com/Ravikiran9988/Axly-Gateway.git
cd Axly-Gateway
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` to configure the database connection string and generate both security secrets. Run this command twice and paste one output into each secret field:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Do not reuse the example values from CI or another installation. For hosted deployments, set `ALLOWED_HOSTS` to the backend's actual hostname (for example, the Render service hostname) and set `CORS_ORIGINS` to the exact frontend origin.

### 2. Backend Installation & Startup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start FastAPI server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend API will be accessible at `http://localhost:8000`.  
Interactive Swagger docs: `http://localhost:8000/docs`.

### 3. Frontend Installation & Startup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Complete the first-run administrator setup to access the dashboard.

---

## 🧪 Testing

### Backend Test Suite
```bash
cd backend
alembic upgrade head
pytest -v
```
The backend suite exercises authentication, credential encryption, provider adapters, failover, streaming, circuit breakers, quota handling, and concurrency. Check CI for the current passing test count.

### Frontend Vitest Suite
```bash
cd frontend
npm test
```

### Production Build
```bash
cd frontend
npm run build
```

---

## 📚 API Integration Example

### Python OpenAI SDK

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="axly-YOUR_GATEWAY_API_KEY",
)

# Route using abstract aliases ("fast", "smart", "coding", "cheap")
response = client.chat.completions.create(
    model="fast",
    messages=[
        {"role": "system", "content": "You are a concise engineering lead."},
        {"role": "user", "content": "Explain circuit breaker states in 2 sentences."},
    ],
    temperature=0.7,
)

print(response.choices[0].message.content)
```

### Streaming SSE Example

```python
stream = client.chat.completions.create(
    model="smart",
    messages=[{"role": "user", "content": "Write a retry backoff algorithm."}],
    stream=True,
)

for chunk in stream:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
