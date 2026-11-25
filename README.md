# AXLY Gateway

> **One API. Intelligent Routing. Zero-Downtime Failover.**  
> The unified, self-hosted LLM gateway for your AI applications.

AXLY Gateway provides one OpenAI-compatible chat-completions endpoint in front of multiple LLM providers. Configure provider credentials, model aliases, priority-based routing, cooldowns, quota groups, and fallback policies from a web console—then send requests through a single gateway API key.

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=20232A)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Contents

- [Why AXLY Gateway](#why-axly-gateway)
- [Capabilities](#capabilities)
- [Architecture](#architecture)
- [Supported providers](#supported-providers)
- [Technology stack](#technology-stack)
- [Quick start](#quick-start)
- [Run with Docker Compose](#run-with-docker-compose)
- [Use the gateway API](#use-the-gateway-api)
- [Administration and API reference](#administration-and-api-reference)
- [Configuration reference](#configuration-reference)
- [Security and production deployment](#security-and-production-deployment)
- [Health checks and operations](#health-checks-and-operations)
- [Development and tests](#development-and-tests)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)
- [License](#license)

## Why AXLY Gateway

Applications can become tightly coupled to one model provider, one credential, or one provider's rate limits. AXLY Gateway places a controllable routing layer between your application and upstream LLM providers.

- **One client integration:** use a single gateway URL and gateway API key.
- **Provider choice:** configure Gemini, Groq, and OpenAI in one control plane.
- **Visible routing decisions:** define aliases and ordered fallback candidates rather than hiding provider selection in application code.
- **Credential resilience:** maintain multiple upstream credentials, track their health, and apply cooldowns when providers reject or throttle requests.
- **Operational visibility:** inspect request outcomes, routing attempts, latency, token usage, estimated cost, and provider health.

AXLY Gateway is self-hosted. You operate the application, PostgreSQL database, provider accounts, credentials, network perimeter, and backups.

## Capabilities

| Area | What is available |
|---|---|
| OpenAI-compatible API | POST /v1/chat/completions, JSON responses, and Server-Sent Events (SSE) streaming |
| Provider adapters | Google Gemini, Groq, and OpenAI |
| Model selection | Direct provider/model targets and configurable model aliases |
| Routing | Ordered candidate chains, routing profiles, attempt limits, and fallback policies |
| Credential pools | Multiple encrypted credentials per provider, priority, health state, RPM/TPM limits, and quota-group association |
| Cooldowns | Automatic recovery windows, exponential backoff with jitter, and support for upstream Retry-After values |
| Circuit breakers | CLOSED, HALF_OPEN, and OPEN states with transition history and administrative reset |
| Gateway API keys | Create, list, and revoke client keys; per-key RPM limits and optional expiration |
| Playground | Test configured models and aliases with JSON or streaming responses |
| Request logs | Search and filter request records, inspect routing attempts, and export CSV |
| Analytics | Request, success, failure, token, latency, provider/model, failover, and estimated-cost views |
| Health | Application liveness, database readiness, and administrative subsystem diagnostics |

**Compatibility scope:** AXLY Gateway currently exposes the chat-completions API surface at /v1/chat/completions. It is not a drop-in implementation of every OpenAI API endpoint. Provider model capabilities and supported request parameters can differ by upstream provider.

### Routing concepts

- **Model alias:** a client-facing name such as fast, smart, coding, or cheap. Create and configure aliases in the Routing console; the names are examples, not guaranteed preconfigured routes.
- **Direct model target:** identify a provider and model explicitly, for example gemini/model-id, groq/model-id, or openai/model-id.
- **Candidate chain:** an ordered list of provider/model/credential candidates to try according to the configured routing policy.
- **Cooldown:** temporarily skip a credential after a rate limit or eligible upstream failure, then make it available again according to its recovery policy.
- **Quota group:** associate credentials that share an upstream billing or quota boundary so the gateway can avoid treating sibling keys as independent capacity.

## Architecture

~~~mermaid
flowchart LR
    A["Application / SDK"] -->|"POST /v1/chat/completions"| B["AXLY Gateway"]
    B --> C["Gateway-key authentication"]
    C --> D["Model / alias resolution"]
    D --> E["Routing and failover engine"]
    E --> F["Credential selection"]
    F --> G["Cooldown and circuit breaker"]
    G --> H["Quota and rate-limit checks"]
    H --> I["Gemini"]
    H --> J["Groq"]
    H --> K["OpenAI"]
    B <--> L[("PostgreSQL")]
    L --- M["Configuration, credentials, keys, request logs, routing history"]
~~~

The React console communicates with the FastAPI backend. PostgreSQL stores administrator records, encrypted provider credentials, routing configuration, gateway key hashes, and operational records. Provider requests are made through asynchronous HTTP clients; streaming responses are returned as SSE.

## Supported providers

| Provider | Adapter identifier | Example direct model format |
|---|---|---|
| Google Gemini | gemini | gemini/model-id |
| Groq | groq | groq/model-id |
| OpenAI | openai | openai/model-id |

Use model discovery and provider test actions in the console to validate provider configuration and discover available model IDs. Provider model names and availability can change; use the IDs returned by your provider account rather than relying on examples in documentation.

## Technology stack

**Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic v2, PostgreSQL, SQLAlchemy 2.x async ORM, Alembic, HTTPX, Argon2id, JWT, and AES-256-GCM.

**Frontend:** React 18, Vite, JavaScript, Tailwind CSS, Lucide React, React Router 6, TanStack Query 5, Recharts, and Vitest.

## Quick start

These instructions run the frontend and backend as separate development processes and use a PostgreSQL instance installed on your machine. Docker is optional.

### Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer (npm included)
- PostgreSQL 15 or newer
- Git

### 1. Get the source and configure the environment

**Windows PowerShell**

~~~powershell
git clone https://github.com/Ravikiran9988/Axly-Gateway.git
cd Axly-Gateway
Copy-Item .env.example .env
~~~

Edit the root .env file. Configure these values:

- **DATABASE_URL:** async SQLAlchemy connection URL used by the application.
- **DATABASE_SYNC_URL:** synchronous SQLAlchemy connection URL used by Alembic.
- **ENCRYPTION_MASTER_KEY:** 32-byte key represented by 64 hexadecimal characters.
- **JWT_SECRET_KEY:** a strong random signing secret of at least 32 characters.

Generate fresh secrets locally. Run this command once for each secret and put the two different outputs into the corresponding fields:

~~~powershell
python -c "import secrets; print(secrets.token_hex(32))"
~~~

Do not use the placeholder database password from .env.example outside a disposable local setup. Replace it with the password for your PostgreSQL role. If the password contains URL-reserved characters, percent-encode it before placing it in a connection URL. This command prompts without echoing the original password:

~~~powershell
python -c "import getpass; from urllib.parse import quote; print(quote(getpass.getpass('Database password: '), safe=''))"
~~~

Keep the root .env file out of Git. Never commit database passwords, JWT secrets, encryption keys, or provider API keys.

**Environment-file precedence:** backend settings load .env and then ../.env. When both files define the same setting, the root .env takes precedence. For a simple local setup, keep one canonical configuration in the repository-root .env; avoid conflicting copies in backend/.env.

### 2. Prepare PostgreSQL

Make sure the PostgreSQL service is running and listening on the port in your connection URLs (the default local PostgreSQL port is 5432).

Create the application database if it does not already exist. On Windows, connect with your PostgreSQL installation's psql.exe:

~~~powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres
~~~

At the postgres=# prompt:

~~~sql
CREATE DATABASE axly_gateway;
\q
~~~

If the database already exists, do not create it again. Use your actual PostgreSQL role, password, host, port, and database name in both connection URLs.

Example connection URL shape:

~~~dotenv
DATABASE_URL=postgresql+asyncpg://postgres:URL_ENCODED_PASSWORD@127.0.0.1:5432/axly_gateway
DATABASE_SYNC_URL=postgresql+psycopg://postgres:URL_ENCODED_PASSWORD@127.0.0.1:5432/axly_gateway
~~~

Replace the placeholder with the same encoded password in both URLs. Do not paste real connection URLs into issues or public discussions.

### 3. Install and start the backend

Open a terminal in the repository root.

**Windows PowerShell**

~~~powershell
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

# Create/update the database schema
alembic upgrade head

# Start the API in development mode
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
~~~

If PowerShell blocks virtual-environment activation, use a terminal where script execution is permitted or activate the environment from Command Prompt with .venv\Scripts\activate.bat. Do not change the machine-wide execution policy just for this project.

**macOS / Linux**

~~~bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
~~~

The backend listens at http://127.0.0.1:8000. Keep this terminal running.

### 4. Start the frontend

Open a second terminal at the repository root:

~~~powershell
cd frontend
npm install
npm run dev
~~~

Vite prints the local frontend URL, normally http://localhost:5173.

### 5. Create the first administrator

1. Open http://localhost:5173/setup.
2. Enter the administrator email and a strong password (at least 8 characters), then confirm the password.
3. Select **Initialize Gateway**.
4. After setup succeeds, sign in at http://localhost:5173/login.

The first-run setup endpoint is locked after an administrator exists. If setup reports that an administrator already exists, use the login page instead. Do not delete administrator records or recreate the database just to get past the setup screen.

For local development, interactive API documentation is available at http://127.0.0.1:8000/docs while DEBUG=true or the environment is not production.

## Run with Docker Compose

The repository includes a Compose configuration for the full stack: PostgreSQL, FastAPI, and the Nginx-served React frontend. The Compose file uses PostgreSQL 16 in its container.

1. Copy the environment template:

   ~~~powershell
   Copy-Item .env.example .env
   ~~~

2. In the root .env, set strong values for the database and security secrets. Add the Compose variables below. Use a password made of URL-safe letters and numbers for POSTGRES_PASSWORD, because Compose builds the container connection URLs from these values:

   ~~~dotenv
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=replace-with-a-strong-unique-password
   POSTGRES_DB=axly_gateway
   ~~~

   Also set fresh ENCRYPTION_MASTER_KEY and JWT_SECRET_KEY values as described above. Do not keep the Compose defaults for a real deployment.

3. Build and start the services:

   ~~~powershell
   docker compose up --build -d
   docker compose ps
   docker compose logs -f backend
   ~~~

4. Open http://localhost:5173 and complete first-run setup.

The Compose frontend proxies /api/, /v1/, /health, and /ready to the backend. Its /v1/ proxy disables response buffering and uses extended proxy timeouts for SSE streaming.

Useful commands:

~~~powershell
# Follow service logs
docker compose logs -f backend

# Stop services; the named PostgreSQL volume is retained
docker compose down

# CAUTION: this also deletes the PostgreSQL data volume.
# Do not run this if you need to keep your gateway data.
docker compose down -v
~~~

The Compose file publishes PostgreSQL on host port 5432 for local access. Before using Compose on a production host, review published ports and host firewall rules; do not expose PostgreSQL directly to the public internet.

## Use the gateway API

Create a gateway client key in the **API Keys** section of the administrator console. The plaintext key is returned only once when created. Store it in a secret manager or environment variable; AXLY Gateway stores only its SHA-256 hash.

The key's default prefix is axly_live_. The example below uses a placeholder—replace it with the key created in your own console.

### cURL

**Windows PowerShell**

~~~powershell
$env:AXLY_API_KEY = "axly_live_REPLACE_WITH_YOUR_KEY"

$body = @{
  model = "fast"
  messages = @(
    @{ role = "system"; content = "You are a concise engineering assistant." }
    @{ role = "user"; content = "Explain a circuit breaker in two sentences." }
  )
  temperature = 0.2
  stream = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://127.0.0.1:8000/v1/chat/completions" -Method Post -Headers @{ Authorization = "Bearer $env:AXLY_API_KEY" } -ContentType "application/json" -Body $body
~~~

**cURL on macOS / Linux**

~~~bash
export AXLY_API_KEY="axly_live_REPLACE_WITH_YOUR_KEY"

curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer $AXLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fast",
    "messages": [
      {"role": "system", "content": "You are a concise engineering assistant."},
      {"role": "user", "content": "Explain a circuit breaker in two sentences."}
    ],
    "temperature": 0.2
  }'
~~~

The fast alias is an example. Configure it in **Routing** before using it. You can also target a model directly using the provider/model-id format supported by the configured provider.

### Python with the OpenAI SDK

Install the SDK in the client project:

~~~bash
pip install openai
~~~

Then call AXLY Gateway using the standard OpenAI client:

~~~python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key=os.environ["AXLY_API_KEY"],
)

response = client.chat.completions.create(
    model="fast",  # Configure this alias in AXLY Gateway first.
    messages=[
        {"role": "system", "content": "You are a concise engineering assistant."},
        {"role": "user", "content": "Explain a circuit breaker in two sentences."},
    ],
    temperature=0.2,
)

print(response.choices[0].message.content)
~~~

### Streaming responses

Set stream=True to receive server-sent event chunks:

~~~python
stream = client.chat.completions.create(
    model="smart",  # Configure this alias in AXLY Gateway first.
    messages=[{"role": "user", "content": "Describe retry backoff briefly."}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
print()
~~~

Streaming requires the configured upstream model/provider to support streaming. When proxying SSE through another reverse proxy, disable response buffering and configure suitable read timeouts.

### Client key limits

Gateway client keys support:
- A label for identifying the caller.
- A per-key request limit in requests per minute (RPM).
- Optional expiration.
- Immediate revocation from the console.

The gateway key RPM limit is separate from upstream provider credential limits. Provider credentials can be configured with RPM and tokens-per-minute (TPM) ceilings; gateway client keys currently expose RPM, not TPM.

## Administration and API reference

The administrator console is available at the frontend origin. The primary backend routes include:

| Endpoint | Purpose |
|---|---|
| GET /health | Liveness probe for the API process |
| GET /ready | Readiness probe, including database connectivity |
| GET /api/admin/setup/status | Checks whether first-run administrator setup is required |
| POST /api/admin/setup | Creates the first administrator; locked after initialization |
| POST /api/admin/auth/login | Administrator email/password login and JWT issuance |
| GET /api/admin/auth/me | Returns the authenticated administrator profile |
| POST /api/admin/auth/change-password | Changes the authenticated administrator's password |
| GET /api/v1/keys | Lists gateway client keys (administrator authentication required) |
| POST /api/v1/keys | Creates a gateway client key (administrator authentication required) |
| DELETE /api/v1/keys/{key_id} | Revokes a gateway client key (administrator authentication required) |
| POST /v1/chat/completions | OpenAI-compatible chat completion (gateway client key required) |

The console also exposes provider, credential, model, routing, quota group, circuit breaker, settings, health, analytics, and request-log administration endpoints under /api/admin.

The gateway API uses a **gateway client key**. The control plane uses an **administrator JWT**. They are different credentials and are not interchangeable.

## Configuration reference

The root .env.example lists the settings consumed by the application. Important values:

| Variable | Purpose | Guidance |
|---|---|---|
| ENVIRONMENT | Runtime environment label | Use development locally and production for production |
| DEBUG | Enables debug behavior and API docs | Keep false in production |
| APP_NAME | Application display name | Optional branding value |
| BACKEND_HOST / BACKEND_PORT | Uvicorn bind settings used by deployment configuration | Bind to 0.0.0.0 inside a container; bind to localhost for local-only development |
| DATABASE_URL | Async PostgreSQL URL for application requests | Use a dedicated database and a URL-encoded password |
| DATABASE_SYNC_URL | Sync PostgreSQL URL for Alembic migrations | Point to the same database |
| DB_POOL_SIZE | Base SQLAlchemy connection pool size | Tune for database capacity and worker count |
| DB_MAX_OVERFLOW | Additional overflow connections | Account for total connections across all app workers |
| DB_POOL_TIMEOUT | Seconds to wait for a pooled connection | Tune for application workload |
| DB_POOL_RECYCLE | Connection recycle interval in seconds | Set according to database/network policy |
| ENCRYPTION_MASTER_KEY | 32-byte AES key encoded as 64 hex characters | Generate a fresh key; back it up securely |
| JWT_SECRET_KEY | Signs administrator JWT sessions | Generate a fresh random secret of at least 32 characters |
| JWT_ALGORITHM | JWT signing algorithm | Keep the configured supported default unless you have a reason to change it |
| JWT_ACCESS_TOKEN_EXPIRE_MINUTES | Administrator session lifetime | Choose a duration appropriate to your threat model |
| CORS_ORIGINS | Allowed browser origins | Set exact frontend origins; do not use broad wildcards with credentials |
| ALLOWED_HOSTS | Trusted HTTP Host values | List the hostnames used to reach the backend |
| LOG_LEVEL | Application log verbosity | INFO is a sensible production starting point |
| MAX_REQUEST_SIZE_BYTES | Maximum inbound request size | Set according to expected prompt/payload sizes |
| RATE_LIMIT_DEFAULT_RPM | Default application rate-limit setting | Tune based on deployment capacity |

For Docker Compose, also set POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB in the root .env; Compose uses these to initialize its PostgreSQL container and construct the backend's internal database URLs.

## Security and production deployment

AXLY Gateway includes security controls, but a production deployment still depends on secure infrastructure and operator configuration. Review this checklist before exposing an instance to users.

### Built-in controls

- **Administrator passwords:** hashed with Argon2id; plaintext passwords are not stored.
- **Administrator sessions:** signed JWT bearer tokens.
- **Provider credentials:** encrypted at rest using AES-256-GCM with ENCRYPTION_MASTER_KEY.
- **Gateway client keys:** generated with cryptographically secure randomness; only SHA-256 hashes are stored. The raw key is returned once at creation.
- **Request controls:** per-key RPM enforcement and configurable upstream credential RPM/TPM ceilings.
- **Setup protection:** initial administrator creation is available only while the instance has no administrator; setup is locked afterward.
- **Provider URL validation:** custom provider base URLs are restricted by backend validation. Do not weaken this validation to route to arbitrary hosts.

### Production checklist

- [ ] Set ENVIRONMENT=production and DEBUG=false.
- [ ] Generate unique ENCRYPTION_MASTER_KEY and JWT_SECRET_KEY values for this instance.
- [ ] Store secrets in a deployment secret manager or protected environment configuration—not in Git, images, logs, or build output.
- [ ] Back up the encryption master key securely. Losing it can make previously encrypted provider credentials unrecoverable.
- [ ] Use a dedicated PostgreSQL database and a database role with only the permissions the application and migration process require.
- [ ] Keep PostgreSQL on a private network. Restrict inbound access to the database and backend ports using firewall/security-group rules.
- [ ] Terminate HTTPS at a trusted reverse proxy or load balancer. Do not expose the admin console or API over plain HTTP on an untrusted network.
- [ ] Set CORS_ORIGINS to the exact HTTPS frontend origin(s) and ALLOWED_HOSTS to the actual backend hostnames.
- [ ] Restrict access to first-run setup while bootstrapping the instance. Verify is_setup_required is false before making a new instance publicly reachable.
- [ ] Create gateway keys per application or environment; store them in a secret manager and revoke any key that may have leaked.
- [ ] Use separate provider credentials where practical; apply sensible RPM/TPM limits and expiration/rotation policies.
- [ ] Configure database backups and test restores. Protect backups and encryption keys separately.
- [ ] Monitor /health, /ready, backend logs, provider errors, request failures, and database capacity.
- [ ] Keep dependencies and the host operating system patched. Review changes before upgrading production.
- [ ] Ensure your reverse proxy supports SSE: disable response buffering for /v1/ and set timeouts appropriate for long-running model responses.

When ENVIRONMENT=production and DEBUG=false, the FastAPI Swagger and ReDoc documentation routes are disabled by the application.

**Deployment note:** the included Docker Compose file is a convenient starting point, not a complete production hardening profile. Review network exposure, TLS, secrets management, backups, resource limits, logging, and update strategy for your environment before using it in production.

## Health checks and operations

- **Liveness:** GET /health indicates that the API process is responding.
- **Readiness:** GET /ready checks PostgreSQL connectivity and reports a non-ready status when the database check fails.
- **Request correlation:** gateway responses include an X-Request-ID value that can be used to correlate client errors with request logs.
- **Streaming:** the chat endpoint returns text/event-stream when stream=true; reverse proxies must not buffer this response.

Do not treat liveness alone as proof that the instance can serve requests. Use readiness and the administrative health diagnostics when investigating startup or database issues.

## Development and tests

Run the backend tests from the backend directory:

~~~powershell
alembic upgrade head
pytest -v
~~~

Run the frontend tests and production build from the frontend directory:

~~~powershell
npm test
npm run build
~~~

Useful development commands:

~~~powershell
# Backend (from backend/)
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (from frontend/)
npm run dev
~~~

The automated tests cover authentication, configuration, encryption, provider adapters, gateway keys, routing, cooldowns, circuit breakers, failover, streaming, request logs, analytics, and frontend flows. They do not replace a deployment smoke test against your own database, provider accounts, network, and reverse proxy.

## Troubleshooting

| Symptom | Checks |
|---|---|
| Connection refused on port 5432 | Confirm the PostgreSQL Windows service or database container is running and listening on the port configured in both database URLs. |
| Error mentions port 5433 even though .env shows 5432 | Check for a second .env file and process-level DATABASE_URL / DATABASE_SYNC_URL environment variables. The backend loads .env and then ../.env; the latter can override duplicate values. Restart the backend after changing configuration. |
| fe_sendauth: no password supplied | Put the PostgreSQL role's password in both connection URLs. URL-encode reserved characters. Never paste the complete URL into an issue. |
| password authentication failed | Verify the PostgreSQL role, password, database, host, and port. Test with psql -h 127.0.0.1 -p 5432 -U db-user -d database -W. |
| database axly_gateway does not exist | Create the database, then run alembic upgrade head. |
| Setup says an administrator already exists | This is expected after first-run initialization. Sign in at /login; setup is intentionally locked after an administrator is created. |
| HTTP 500 during setup or login | Inspect the backend terminal logs and request ID. Check database readiness, migrations, and required environment variables before changing credentials. |
| WinError 10013 when starting Uvicorn | Check whether another process is using the port, or try a different local development port after updating the frontend API/proxy configuration as appropriate. |
| Streaming response appears delayed | Check that every reverse proxy in the path disables buffering for /v1/ and allows sufficiently long read timeouts. |

**Windows note:** if PowerShell cannot find docker, Docker Desktop/CLI is not installed or is not on PATH. You can run AXLY Gateway without Docker by using a locally installed PostgreSQL service and the manual setup steps above.

## Project layout

~~~text
Axly-Gateway/
├── backend/
│   ├── app/
│   │   ├── api/              # Admin and chat-completions routes
│   │   ├── core/             # Settings, security, logging
│   │   ├── db/               # SQLAlchemy sessions and dependencies
│   │   ├── models/           # Database models
│   │   ├── providers/        # Gemini, Groq, and OpenAI adapters
│   │   └── services/         # Auth, routing, keys, and gateway services
│   ├── alembic/              # Database migrations
│   └── tests/                # Backend automated tests
├── frontend/
│   ├── src/
│   │   ├── api/              # Backend API clients
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # Authentication and theme state
│   │   └── pages/            # Console screens
│   └── nginx.conf            # SPA and API/SSE reverse-proxy config
├── docs/                     # Routing, failover, cooldown, and quota guides
├── docker-compose.yml
└── .env.example
~~~

## Roadmap and scope

AXLY Gateway is an actively developed self-hosted project. The implemented API compatibility surface and provider adapters are listed above; do not assume unlisted endpoints, providers, or model capabilities are available. Contributions, bug reports, and focused improvements are welcome.

For deeper operational details, see:
- [Routing](docs/ROUTING.md)
- [Failover](docs/FAILOVER.md)
- [Cooldown policies](docs/COOLDOWN_POLICIES.md)
- [Quota management](docs/QUOTA_MANAGEMENT.md)
- [Circuit breakers](docs/CIRCUIT_BREAKERS.md)
- [Routing troubleshooting](docs/ROUTING_TROUBLESHOOTING.md)

## License

AXLY Gateway is released under the [MIT License](LICENSE).
