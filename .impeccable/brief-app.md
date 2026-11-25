# AXLY Gateway Control Plane — Surface Brief

- **Mode:** Operate (with Read mode typography in API Documentation)
- **Primary Targets:** `frontend/src/App.jsx`, `frontend/src/pages/*`, `frontend/src/components/*`
- **Visitor & Job:** AI engineers and platform teams operating self-hosted LLM gateway traffic, managing upstream providers & encrypted credentials, authoring failover aliases, issuing client keys, testing live inference, inspecting traces, and auditing telemetry.
- **Navigation IA:** 8 core sidebar routes (`Dashboard`, `Providers`, `API Keys`, `Routing`, `Playground`, `Request Logs`, `Analytics`, `Settings`) with integrated tabs (`Credentials` and `Models` inside `Providers`, `Fallback & Recovery` inside `Routing`, `Health Monitor` inside `Settings`, `API Documentation` accessible from `API Keys` and `Playground`) while preserving existing URL routes.
- **Theme Default:** Dark theme (`#0F1115`) on first visit with toggleable calibrated light theme (`#F4F5F3`).

## Direction contract

THESIS: Every LLM request runs like an express timetable across interchangeable upstream tracks: priority aliases, failover relays, and provider limits snap onto disciplined Swiss rule-divided schedules instead of soft generic cloud dashboards.

OWN-WORLD: Swiss Rail Timetable — Matte charcoal dark ground (`#0F1115`) and anodized gunmetal sidebar (`#161920`) paired with Swiss station paper light theme (`#F4F5F3` / `#FFFFFF`), razor-crisp `1px` structural hairline rules, `2px` architectural rule header separators, sharp `2px–4px` precision corners, `Public Sans` UI typography with tabular `JetBrains Mono` numerics, Swiss signal vermilion-red (`#E12D2D`) strictly reserved for the `AXLY` mark, primary creation CTAs, and active selection indicators, alongside semantic emerald (`#22C55E`), cobalt (`#38BDF8`), and amber (`#F59E0B`) route states.

STORY: On arrival an operator immediately verifies gateway readiness, 24h request volume, success SLO, token/cost totals, and mean latency, inspects live alias failover tracks (`Groq -> Gemini -> OpenAI`), drills into Recharts throughput and provider allocation, or jumps straight to creating API keys, testing live SSE inference, or tracing failed attempts.

FIRST VIEWPORT: Fixed 240px left rail (`#161920`) with `AXLY` signal badge, 8 streamlined section links, and theme toggle; `52px` live readiness topbar (`/health` + `/ready` latency ping, admin identity, quick API Docs link); main content opened by a `2px` rule-anchored header (`PageHeader` + time-range toggle + action CTA), a `4`-column hairline-divided KPI timetable strip (`Total Requests`, `Success Rate`, `Tokens & Est.`, `Mean Latency`), the live `Track Schedule · Alias Routes` failover matrix, and a asymmetric `3:2` Recharts telemetry band below.

FORM: Swiss Rail Timetable (candidate #1 on ordered grounded list; picked from the direction round matching `.impeccable/mocks/decision/model-pick.html`), seed:610acbe50d365df6.

FINISH: "unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance"
