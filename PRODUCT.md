# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

AI engineers, developers, and platform teams self-hosting **AXLY Gateway** as a single-tenant control plane. Operators configure upstream LLM providers and encrypted credentials, issue client gateway API keys, author priority and alias failover routing policies, test live streaming inference, and investigate latency, cost, errors, and circuit-breaker events.

## Product Purpose

Provide one unified, OpenAI-compatible LLM gateway (`POST /v1/chat/completions`) that decouples AI applications from single-provider outages, rate limits, and quota exhaustion through intelligent routing, adaptive cooldowns, shared quota groups, circuit breakers, and zero-downtime automatic failover.

## Positioning

A transparent, self-hosted LLM infrastructure plane that exposes exact decision trails for every request: prioritized alias failover chains, AES-256-GCM encrypted multi-key credential pools, real upstream connectivity verification, step-by-step `RoutingHistory` traces, and `X-Axly-*` response headers — backed directly by live PostgreSQL telemetry rather than opaque managed proxies.

## Operating Context

- **Runtime environment:** Self-hosted web dashboard (`React 18` + `Vite` + `JavaScript` + `Tailwind CSS`) backed by `FastAPI` and `PostgreSQL`.
- **Theme expectation:** Developers frequently monitor and debug infrastructure in low-light or IDE-adjacent setups; dark theme loads by default on first visit (`axly_theme`), paired with a carefully calibrated light theme switchable in the header and Settings.
- **Navigation architecture:** Streamlined 8-section sidebar (`Dashboard`, `Providers`, `API Keys`, `Routing`, `Playground`, `Request Logs`, `Analytics`, `Settings`) with integrated views (`Credentials` and `Models` inside `Providers`, `Fallback & Recovery` inside `Routing`, `Health Monitor` inside `Settings`, and `API Documentation` accessible from `API Keys` and `Playground`), while preserving existing routes cleanly.

## Capabilities and Constraints

- **Implemented capabilities only (no invented backend features):**
  - **Dashboard & Analytics:** Overview metrics (`total_requests`, `successful_requests`, `failed_requests`, `success_rate`, `total_tokens`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`, `avg/p50/p95/p99_latency_ms`, `failover_count`, `active_providers`, `healthy_credentials`, `cooldown_credentials`), time-series charts (`24h`/`7d`/`30d`/`90d`/`all`), provider/model/status/error-category breakdowns, and CSV summary export.
  - **Providers, Credentials & Models:** CRUD for Gemini, Groq, and OpenAI providers, enable/disable switches, model discovery (`/discover-models`), AES-256-GCM credentials with priority ranking, `rate_limit_rpm` & `rate_limit_tpm` ceilings, quota group links, upstream connectivity test (`/test`), manual cooldown & verified recovery (`/cooldown`, `/recover`), and model catalog context/pricing/capabilities (`vision`, `tool_calling`, `streaming`).
  - **Routing, Fallback & Recovery:** Model aliases (`fast`, `smart`, `coding`, `cheap`, etc.) with ordered candidates, routing profiles (`strategy`, `max_attempts`, `retry_after_cooldown`), circuit breakers (`CLOSED`, `HALF_OPEN`, `OPEN`, transition history, manual reset), shared quota groups, and routing history traces.
  - **API Keys & API Docs:** Gateway client keys (`axly-...`, SHA-256 hashed, `rate_limit_rpm` 1–10000, optional `expires_at`, one-time `raw_key` reveal, revocation) and OpenAI-compatible SDK/cURL/Node reference docs. (Note: Gateway client keys expose `rate_limit_rpm` and `expires_at`; `rate_limit_tpm` applies to upstream Provider Credentials.)
  - **Playground:** Real `POST /v1/chat/completions` chat testing with Gateway API key input, alias/model selector, SSE streaming vs JSON mode, `temperature`/`max_tokens`/`top_p` sliders, system prompt, abort controller, and execution metadata bar.
  - **Request Logs:** Paginated searchable/filterable execution logs, authenticated CSV export, and per-request detail drawer/modal showing step-by-step `RoutingHistory` attempts.
  - **Settings & Health Monitor:** Instance settings (`general`, `routing_defaults`, `security_logging`), administrator password change, liveness/readiness probes (`/health`, `/ready`), and `/api/admin/health/diagnostics`.
- **Technical constraints:** Keep React + Vite + JavaScript (no TypeScript), Tailwind CSS, React Router v6, TanStack Query v5, Recharts, Lucide React, and Vitest; preserve existing authentication (`Setup`, `Login`, JWT), backend API contracts, and business logic.

## Brand Commitments

- **Product Name:** AXLY Gateway
- **Tagline:** `One API. Intelligent Routing. Zero-Downtime Failover.`
- **Descriptor:** `The unified LLM gateway for your AI apps.`
- **Design constraints:** Refined developer-tool aesthetic without generic AI SaaS templates, excessive gradients, unnecessary glassmorphism, oversized cards, or purely decorative elements.

## Evidence on Hand

- Live backend routes under `/api/admin/*`, `/api/v1/keys`, `/v1/chat/completions`, `/health`, and `/ready`.
- Empty-state onboarding cURL command displayed cleanly when `total_requests === 0`.
- Absence: Gateway client keys (`GatewayKeyCreate`/`GatewayKeyResponse`) do not track TPM limits in the database; only upstream `ProviderCredential` records expose `rate_limit_tpm`. Frontend must reflect these real data models accurately.

## Product Principles

1. **Truth at every layer:** Every KPI, health state, failover attempt, and token figure traces directly to backend telemetry with zero fabricated values or decorative chrome.
2. **Traceability over magic:** Make routing decisions, fallback order, cooldown reasons, and error classifications immediately inspectable.
3. **Calm operational clarity:** Prioritize high-signal scannability, consistent affordances, tabular numeric alignment, and responsive layouts under incident pressure.
4. **Honest error & boundary states:** Surface missing credentials, rate-limit cooldowns, and upstream failures with clear recovery actions instead of ambiguous alerts.

## Accessibility & Inclusion

- Semantic HTML controls with explicit `htmlFor`/`id` bindings, `role="dialog"`/`aria-modal` behavior, keyboard focus rings, keyboard-activatable table rows, `aria-label` on icon-only actions, WCAG AA contrast in both dark and light themes, and full responsiveness across desktop, tablet, and mobile viewports.
