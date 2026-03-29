# FloodGate — Design Reference for Claude

This file captures the architectural decisions, conventions, and patterns that
must be followed consistently when adding or modifying any part of this
repository. Read it before making changes.

---

## Project overview

FloodGate is a **high-frequency instrumentation analysis platform** for
400 kHz–1 MHz acquisition systems. Events are 0.5–2 s captures with many
simultaneous channels (strain, AE, pressure, acceleration, voltage).

The prototype stack:

| Layer | Technology |
|---|---|
| SPA | Vite 8 + React 19 + TypeScript + Tailwind v4 |
| Time-series rendering | uPlot 1.6 (Canvas2D, `AlignedData`) |
| State management | Zustand 5 |
| Routing | React Router v7 |
| Layout engine | react-grid-layout v2 |
| Metadata service | FastAPI (Python 3.11) |
| Metadata database | PostgreSQL 16 + Alembic migrations |
| Waveform service | Go 1.23 |
| Compute service | FastAPI (Python 3.11) + NumPy + SciPy |
| Object storage | MinIO (S3-compatible) |
| Auth | Keycloak OIDC (Realm: `floodgate`) |
| Reverse proxy | nginx-unprivileged (BFF gateway) |
| Container runtime | Docker / Docker Desktop |

---

## Repository layout

```
flood-gate/
├── src/                          # React SPA
│   ├── api/                      # Typed HTTP clients (one file per service)
│   ├── components/
│   │   ├── dashboard/            # react-grid-layout wrapper
│   │   ├── layout/               # AppShell, TopBar
│   │   ├── panels/               # ChannelPanel (sidebar)
│   │   └── widgets/              # WaveformWidget, StatsWidget, ComparativeWidget, FFTWidget, WidgetContainer
│   ├── data/
│   │   └── mockData.ts           # Deterministic mock data + waveform generator
│   ├── pages/                    # LandingPage, TestEventsPage, WorkspacePage
│   ├── store/                    # Zustand stores (workspaceStore, authStore)
│   └── types/                    # All shared TypeScript interfaces (index.ts)
├── services/
│   ├── metadata-service/         # FastAPI — tests, events, channel catalogue
│   │   ├── alembic/              # Alembic migration environment
│   │   │   ├── env.py            # Migration runner (swaps asyncpg→psycopg2)
│   │   │   └── versions/         # Numbered migration scripts
│   │   ├── alembic.ini           # Alembic configuration
│   │   ├── app/
│   │   │   ├── auth/             # Keycloak JWT validation, dependencies, models
│   │   │   ├── config.py         # pydantic-settings
│   │   │   ├── db/               # Repository pattern (protocol, mock, PostgreSQL)
│   │   │   │   ├── protocol.py   # MetadataRepository Protocol (structural typing)
│   │   │   │   ├── mock.py       # In-memory mock for USE_MOCK_DATA=true
│   │   │   │   ├── models.py     # SQLAlchemy ORM models (tests, events, channels)
│   │   │   │   ├── engine.py     # Async engine + session factory lifecycle
│   │   │   │   ├── repository.py # PgMetadataRepository (async SQLAlchemy queries)
│   │   │   │   └── dependencies.py # FastAPI Depends() — switches mock vs real
│   │   │   ├── middleware/       # structlog request logging
│   │   │   ├── models/           # Pydantic domain models + API schemas
│   │   │   ├── routers/          # /tests, /events, /channels
│   │   │   ├── services/         # CSV parser for waveform upload
│   │   │   └── storage/          # MinIO client for waveform upload
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   ├── waveform-service/         # Go — serves waveform samples from MinIO
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── auth/             # JWKS cache + Bearer/cookie middleware
│   │   │   ├── config/           # Env-var config
│   │   │   ├── handler/          # HTTP handlers
│   │   │   └── storage/          # MinIO client wrapper
│   │   ├── Dockerfile
│   │   └── go.mod
│   └── compute-service/          # FastAPI — FFT, PSD, and RMS envelope
│       ├── app/
│       │   ├── auth/             # Keycloak JWT validation, dependencies, models
│       │   ├── config.py         # pydantic-settings
│       │   ├── middleware/       # structlog request logging
│       │   ├── models/           # Pydantic response schemas (FFTOut, PSDOut, EnvelopeOut)
│       │   ├── routers/          # /compute/{testId}/{eventId}/{channelId}/*
│       │   └── storage/          # MinIO waveform fetcher (async, executor-based)
│       ├── Dockerfile
│       └── pyproject.toml
├── scripts/
│   └── load_mock_waveforms/      # Python — seeds MinIO with deterministic data
│       ├── main.py
│       ├── requirements.txt
│       └── Dockerfile
├── Dockerfile                    # Frontend multi-stage build
├── nginx.conf                    # Hardened nginx config + API routing
└── docker-compose.yml            # Full local stack
```

---

## Authentication pattern — follow this on every service

All services use **dual-mode auth**. The same request can carry:

1. **Bearer token** (primary) — `Authorization: Bearer <keycloak_jwt>`
   Used by the React SPA after PKCE login and by machine clients using
   `client_credentials` grant.

2. **BFF session cookie** (fallback) — `Cookie: session_token=<keycloak_jwt>`
   Used when nginx plants the Keycloak access token in an HttpOnly cookie after
   a server-side OIDC exchange. The cookie name is configurable.

**Rules:**
- Bearer takes precedence when both are present.
- If neither is present → `401 Unauthorized`.
- If a credential is present but invalid/expired → `403 Forbidden`.
- Unauthenticated access is never granted to data endpoints.
- `/health` is always unauthenticated.

**JWT validation:**
- Algorithm: RS256 only (`verify_algorithms` / `jwt.WithValidMethods`).
- Issuer: `{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}` — always verified.
- Audience: `{KEYCLOAK_CLIENT_ID}` — verified by default; disable with
  `JWT_VERIFY_AUDIENCE=false` for initial dev setup before Keycloak is configured.
- JWKS: fetched from Keycloak's discovery endpoint, cached with configurable TTL
  (`JWKS_CACHE_TTL_SECONDS`). A `kid` miss forces a single re-fetch before
  failing (handles key rotation transparently).

**Python (FastAPI) reference implementation:** `services/metadata-service/app/auth/`
**Go reference implementation:** `services/waveform-service/internal/auth/middleware.go`

Every new service must implement this same pattern. Copy the relevant auth
module from an existing service as the starting point.

---

## Containerisation conventions

Every service must follow all of these rules. No exceptions.

### Multi-stage builds

| Service type | Builder | Runtime |
|---|---|---|
| Python / FastAPI | `python:3.11-slim-bookworm` + gcc/libffi | `python:3.11-slim-bookworm` |
| Go | `golang:1.23-alpine` + git | `alpine:3.21` |
| Node / React | `node:22-alpine` | `nginxinc/nginx-unprivileged:1.27-alpine` |
| One-shot scripts | — | `python:3.11-slim-bookworm` |

Always pin the distro variant (`-bookworm`, `-alpine`). Never use `:latest`.

### Layer caching

Copy dependency manifests **before** source code so the slow install layer is
only invalidated when dependencies change:

```dockerfile
# Python
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app/ ./app/

# Go
COPY go.mod .
RUN go mod download || true
COPY . .
RUN go build ...

# Node
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src/ index.html vite.config.ts tsconfig*.json ./
RUN npm run build
```

### Security hardening (required for every image)

```dockerfile
# Non-root user
RUN groupadd --system --gid 1001 appgroup \
    && useradd --system --uid 1001 --gid appgroup --no-create-home appuser
USER appuser

# Python extras
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random

# Go: statically linked binary, stripped debug info
RUN go build -trimpath -ldflags="-s -w" ...
```

### Compose service requirements

Every service in `docker-compose.yml` must have:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
read_only: true
tmpfs:
  - /tmp:mode=1777
deploy:
  resources:
    limits:
      cpus: "…"
      memory: …M
```

And a `healthcheck` using the service's `/health` endpoint. Data services wait
for auth (Keycloak) and storage (MinIO) before starting:

```yaml
depends_on:
  keycloak:
    condition: service_healthy
  minio:
    condition: service_healthy
```

### OCI labels

Every image must carry at minimum:

```dockerfile
LABEL org.opencontainers.image.title="floodgate-<service>" \
      org.opencontainers.image.description="…" \
      org.opencontainers.image.source="https://github.com/tyler-m-roberg/flood-gate"
```

### `.dockerignore`

Every service directory must have a `.dockerignore` excluding:
- Build artefacts (`dist/`, `__pycache__/`, `*.pyc`, `vendor/`)
- Dev tooling caches (`.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`)
- Secrets (`.env`, `.env.*` — but NOT `.env.example`)
- Git history (`.git/`)
- Documentation (`*.md`, `docs/`)
- Test suites (`tests/`, `test_*.py`)

---

## nginx routing conventions

`nginx.conf` is the BFF gateway. It proxies API calls from the SPA without
exposing raw service ports or requiring the browser to manage auth headers.

**Routing table (longest-prefix match):**

| Path prefix | Upstream | Service |
|---|---|---|
| `/api/v1/waveforms` | `waveform-api:8002` | Go waveform service |
| `/api/v1/compute` | `compute-api:8003` | FastAPI compute service |
| `/api/` | `metadata-api:8001` | FastAPI metadata service |
| `/health` | nginx itself | `return 200 "ok"` |
| `~* \.(js\|css\|…)` | static files | immutable `1y` cache |
| `/` | static files | `try_files` SPA fallback, `no-cache` |

**When adding a new service:**
1. Add a `location /api/v1/<resource>` block **before** the generic `/api/` block.
2. Include the standard proxy headers (see existing blocks for the template).
3. Add the corresponding compose service and internal DNS name.

**Security headers** (`add_header … always`) are set at the server level and
must be repeated in any `location` block that defines its own `add_header`:
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Content-Security-Policy`.

---

## MinIO / object storage conventions

Bucket: `floodgate-waveforms`
Object key schema: `{testId}/{eventId}/{channelId}.json`

JSON payload schema (stored and returned verbatim by waveform-api):

```json
{
  "event_id":   "EVT-001",
  "channel_id": "CH1",
  "test_id":    "TEST-2024-001",
  "sample_rate": 400000.0,
  "n_samples":  2048,
  "start_time": 0.0,
  "unit":       "kN",
  "values":     [1.23, -0.45, …]
}
```

The **time axis is never stored** — it is reconstructed client-side from
`start_time + i / sample_rate`. This keeps object sizes small.

### Mock data

`N_SAMPLES = 2048` is the fixed sample count for all mock waveforms. It must be
the same in:

- `src/data/mockData.ts` — exported as `N_SAMPLES`
- `scripts/load_mock_waveforms/main.py` — `N_SAMPLES = 2048`

The waveform generation algorithm (LCG seeded random + 5 profiles) is the
**canonical source of truth** in `src/data/mockData.ts`. The Python loader in
`scripts/load_mock_waveforms/main.py` is a line-by-line port and must stay in
sync. If the algorithm changes, update both files together.

Seed formula (mirrors `mockData.ts:generateChannelData`):
```
seed = ord(event_id[4]) * 31 + ord(channel_id[2]) * 17 + event_index * 97
```

LCG: `s = (s * 1664525 + 1013904223) & 0xFFFFFFFF; return s / 0xFFFFFFFF`

---

## Frontend conventions

### TypeScript

- All domain types live in `src/types/index.ts`. Do not scatter interface
  definitions across component files.
- Use `@/` path alias for all imports from `src/` (configured in
  `vite.config.ts` and `tsconfig.app.json`).
- No implicit `any`. No `as unknown as X` casts without a comment explaining why.

### Tailwind CSS v4

Import syntax: `@import "tailwindcss"` in `src/index.css`.
**Do not use** `@tailwind base/components/utilities` (v3 syntax).
The Vite plugin is `@tailwindcss/vite` — no `postcss.config.js` needed.

### Zustand stores

- One store per domain concern: `workspaceStore.ts`, `authStore.ts`.
- Async actions are fire-and-forget void IIFEs inside the action function —
  do not expose `Promise<void>` in the `WorkspaceState` interface.
- The `loadingEvents: Set<string>` pattern is used for loading indicators.
- Stats are precomputed eagerly in `loadEvent` after data arrives.

### API clients

- One file per backing service in `src/api/`.
- Use `credentials: 'include'` on all fetch calls so the BFF session cookie is
  forwarded automatically by the browser.
- Every client function throws on non-2xx so callers can catch and fall back.
- Clients expose typed response interfaces that mirror the JSON the service
  returns (snake_case fields matching the service's JSON serialisation).

### Waveform rendering (uPlot)

- `AlignedData` type: `[Float64Array (times), ...Float64Array[] (channels)]`
- All series share a single time axis (first element).
- Do not send the time array over the network — reconstruct with `buildTimeAxis()`.
- Use `uPlot.Options` (not a local alias) for plot config objects.
- Axis `values` callbacks must be explicitly typed:
  `(u: uPlot, vals: number[]) => string[]`

### react-grid-layout v2 API

v2 completely redesigned the API. Use the object-form configs:

```tsx
<GridLayout
  gridConfig={{ cols: 12, rowHeight: 60, margin: [8, 8] }}
  dragConfig={{ handle: '.widget-drag-handle' }}
  resizeConfig={{ handles: ['se'] }}
  onLayoutChange={(layout: Layout) => setLayout(layout as LayoutItem[])}
/>
```

Do **not** use flat props (`cols`, `rowHeight`, etc.) — those are v1 and will
cause TypeScript errors.

---

## Python / FastAPI conventions

### Config

All config via `pydantic-settings` (`BaseSettings`) in `app/config.py`.
- Environment variables map directly to field names (case-insensitive).
- Provide an `.env.example` with every field documented.
- Use `@lru_cache(maxsize=1)` on `get_settings()` for singleton semantics.
- Expose derived helpers as `@property` (e.g. `keycloak_issuer`,
  `keycloak_openid_config_url`).

### Logging

Use `structlog` with **`stdlib.LoggerFactory()`** — not `PrintLoggerFactory()`.
The `add_logger_name` processor requires a stdlib-backed logger.
Request logging middleware injects `X-Request-ID` on every request and
response.

### Linting (Ruff)

```toml
[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
ignore = ["B008"]   # FastAPI Depends() in defaults is intentional
```

Run `ruff check` before committing Python changes.

### Error responses

- 404 when a referenced parent resource does not exist (not 400).
- Include `request_id` in every error JSON body.
- Unhandled exceptions are caught by the global handler and return 500 with
  no internal detail exposed.

### Repository pattern

`app/db/` contains a repository interface. `MockMetadataRepository` in
`app/db/mock.py` implements it for the prototype. `PgMetadataRepository` in
`app/db/repository.py` implements the same protocol with async SQLAlchemy.

The protocol includes both read methods (list/get) and write methods
(create_test, create_event, create_channels).

### Data import

The metadata service supports creating tests and uploading event data:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/tests` | Create a test campaign (JSON body) |
| `POST` | `/api/v1/tests/{testId}/events` | Create an event with CSV waveform data (multipart) |

**CSV upload format** — multipart form with two fields:
- `event_meta`: JSON string of `UploadEventPayload` (event metadata + channel definitions)
- `csv_file`: CSV file with header row `time,CH1,CH2,...` and float data rows

The event creation endpoint:
1. Creates channel metadata in PostgreSQL (idempotent)
2. Creates event metadata in PostgreSQL
3. Uploads each channel's waveform JSON to MinIO

Both write endpoints require analyst or admin role.

The metadata service connects to MinIO for waveform uploads when
`USE_MOCK_DATA=false`. Config fields: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_TLS`.

---

## Go conventions

### Module

Module path: `waveformservice` (local, not a full GitHub path).
Internal packages use the `waveformservice/internal/` prefix.

### Logging

Use `log/slog` (stdlib, Go 1.21+) with `slog.NewJSONHandler` for structured
JSON output. Set as the default: `slog.SetDefault(logger)`.
Request logging uses `middleware.NewWrapResponseWriter` from chi to capture
the response status.

### Error handling

- Define sentinel error types (`NotFoundError`) in the storage layer.
- Use `errors.As()` in handlers to distinguish not-found from internal errors.
- Never return raw storage errors to the client.

### Graceful shutdown

Use `signal.NotifyContext` for `SIGINT`/`SIGTERM` and `srv.Shutdown()` with a
10-second deadline. The binary must exit cleanly when the container is stopped.

### Build flags

Always build with:
```
-trimpath -ldflags="-s -w"
```
This removes debug info and source paths from the binary (~40% size reduction).

### GOFLAGS in Dockerfile

```dockerfile
ENV CGO_ENABLED=0 GONOSUMDB="*" GOFLAGS="-mod=mod"
```

`-mod=mod` allows the build to resolve dependencies without a pre-committed
`go.sum`. In production, commit `go.sum` and remove these flags.

---

## Adding a new service — checklist

1. **Create `services/<name>/`** with the standard layout for the language.
2. **Copy the auth module** from an existing service and adapt env var names.
3. **Add `/health`** endpoint — unauthenticated, returns `{"status":"ok"}`.
4. **Write a multi-stage `Dockerfile`** following the hardening rules above.
5. **Write a `.dockerignore`** excluding dev artefacts.
6. **Add a `location` block** in `nginx.conf` before the generic `/api/` block.
7. **Add the service to `docker-compose.yml`** with:
   - `security_opt`, `cap_drop`, `read_only`, `tmpfs`, `deploy.resources`
   - `depends_on: keycloak: condition: service_healthy`
   - A `healthcheck` using the `/health` endpoint
8. **Update `CLAUDE.md`** — add the service to the routing table and layout.

---

## Port assignments

| Port | Service |
|---|---|
| 3000 | ui (nginx, host-mapped from 8080) |
| 5432 | postgres (metadata database) |
| 8001 | metadata-api (FastAPI) |
| 8002 | waveform-api (Go) |
| 8003 | compute-api (FastAPI + NumPy/SciPy) |
| 8080 | keycloak |
| 9000 | minio S3 API |
| 9001 | minio web console |

Next available port for a new service: **8004**.

---

## Environment variables reference

### Common to all services

| Variable | Default | Description |
|---|---|---|
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL |
| `KEYCLOAK_REALM` | `floodgate` | Realm name |
| `KEYCLOAK_CLIENT_ID` | service-specific | Audience claim |
| `JWT_VERIFY_AUDIENCE` | `true` | Disable for initial setup |
| `COOKIE_AUTH_ENABLED` | `true` | Enable BFF session-cookie fallback |
| `SESSION_COOKIE_NAME` | `session_token` | Cookie key |
| `JWKS_CACHE_TTL_SECONDS` | `300` | JWKS cache lifetime |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `ENVIRONMENT` | `development` | `development`, `staging`, `production` |

### Waveform service

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8002` | Listen port |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO host:port |
| `MINIO_ACCESS_KEY` | `minioadmin` | S3 access key |
| `MINIO_SECRET_KEY` | `minioadmin` | S3 secret key |
| `MINIO_USE_TLS` | `false` | Enable TLS for MinIO |
| `MINIO_BUCKET` | `floodgate-waveforms` | Waveform bucket |

### Metadata service

| Variable | Default | Description |
|---|---|---|
| `USE_MOCK_DATA` | `false` | Use in-memory mock repo (skips DB) |
| `DATABASE_URL` | `postgresql+asyncpg://…` | Async SQLAlchemy connection URL |
| `DB_POOL_SIZE` | `5` | Async connection pool size |
| `DB_MAX_OVERFLOW` | `10` | Max overflow connections beyond pool |
| `DB_POOL_RECYCLE` | `300` | Seconds before recycling a connection |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `UVICORN_WORKERS` | `2` | Worker process count |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO host:port (waveform upload) |
| `MINIO_ACCESS_KEY` | `minioadmin` | S3 access key |
| `MINIO_SECRET_KEY` | `minioadmin` | S3 secret key |
| `MINIO_BUCKET` | `floodgate-waveforms` | Waveform bucket |
| `MINIO_USE_TLS` | `false` | Enable TLS for MinIO |

### Compute service

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8003` | Listen port |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO host:port |
| `MINIO_ACCESS_KEY` | `minioadmin` | S3 access key |
| `MINIO_SECRET_KEY` | `minioadmin` | S3 secret key |
| `MINIO_USE_TLS` | `false` | Enable TLS for MinIO |
| `MINIO_BUCKET` | `floodgate-waveforms` | Waveform bucket (read-only) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `UVICORN_WORKERS` | `2` | Worker process count |

---

## Compute service design

The compute service (`services/compute-service/`) performs server-side signal
analysis on waveform data.  It fetches raw samples directly from MinIO (same
bucket as waveform-service) to avoid inter-service HTTP round-trips.

### Endpoints

All endpoints are authenticated (Bearer or session cookie).  Results are
deterministic for a given (testId, eventId, channelId) triple, so responses
carry `Cache-Control: public, max-age=3600, immutable`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Unauthenticated liveness probe |
| `GET` | `/api/v1/compute/{testId}/{eventId}/{channelId}/fft` | One-sided amplitude spectrum |
| `GET` | `/api/v1/compute/{testId}/{eventId}/{channelId}/psd` | Power Spectral Density (Welch) |
| `GET` | `/api/v1/compute/{testId}/{eventId}/{channelId}/envelope` | Short-time RMS envelope |

### FFT endpoint

Query parameters:
- `window` — `hann` (default) | `hamming` | `blackman` | `none`

Response fields:
- `frequencies` — Hz, one-sided (0 … Nyquist)
- `magnitudes` — amplitude in signal engineering units, normalised so a pure
  sine at amplitude A produces a peak of A
- `peak_frequency` — Hz of the strongest non-DC bin
- `bin_resolution_hz` — frequency resolution = `sample_rate / n_samples`

### PSD endpoint

Uses Welch's averaged periodogram (75 % overlap).

Query parameters:
- `window` — `hann` (default) | `hamming` | `blackman` | `none`
- `nperseg` — segment length in samples, 16–8192 (default 512)

Response fields:
- `frequencies`, `power_db` — one-sided PSD in dB (unit²/Hz)
- `peak_frequency`, `noise_floor_db` (10th-percentile power level)

### Envelope endpoint

Short-time RMS with 75 % overlap sliding window.

Query parameters:
- `window_ms` — window length in milliseconds, >0 and ≤100 (default 1.0)

Response fields:
- `times` — window centre times in seconds
- `envelope` — RMS amplitude per window in signal units
- `rms_total` — overall RMS of the full signal

### Implementation rules

- **Blocking numpy/scipy calls MUST run in a thread-pool executor** so the
  async event loop is never blocked:
  ```python
  loop = asyncio.get_event_loop()
  result = await loop.run_in_executor(None, _compute)
  ```
- **Waveform fetch** uses `app/storage/waveform.py` which calls MinIO via the
  `minio-go/v7` Python SDK in an executor.  Do not call the waveform HTTP service.
- **Auth** is enforced via `_get_waveform` FastAPI dependency — the same
  `get_current_user` pattern as metadata-service.
- **Error mapping**: `WaveformNotFoundError` → 404, MinIO S3Error → 502,
  computation exception → 500.
- **Docker resource limits**: CPUs 2.00, memory 512M (numpy + scipy overhead).

### Frontend integration

- `src/api/computeClient.ts` — typed fetch wrappers (`fetchFFT`, `fetchPSD`, `fetchEnvelope`)
- `src/components/widgets/FFTWidget.tsx` — uPlot frequency-domain canvas widget
- `workspaceStore.ts` — `fftCache: Map<string, FFTResult>`, `loadingFFT: Set<string>`,
  `loadFFT(testId, eventId, channelId, window?)`, `getFFT(channelKey)`
- `FFTResult` type defined in `src/types/index.ts` uses `Float64Array` for
  `frequencies` and `magnitudes` (consistent with `ChannelData`)
- FFT is loaded lazily when the `FFTWidget` mounts with active channels;
  failures are silently swallowed (widget shows "service unavailable" placeholder)

---

## Keycloak realm setup (floodgate)

Clients to create:

| Client ID | Type | Used by |
|---|---|---|
| `floodgate-metadata` | Confidential / Bearer-only | metadata-api |
| `floodgate-waveform` | Confidential / Bearer-only | waveform-api |
| `floodgate-compute` | Confidential / Bearer-only | compute-api |

Realm roles to create: `admin`, `analyst`, `viewer`

Assign realm roles to test users. The services extract roles from
`realm_access.roles` and `resource_access.<client_id>.roles` in the JWT.
