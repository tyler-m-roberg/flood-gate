# FloodGate — Design Reference for Claude

This file captures the architectural decisions, conventions, and patterns that
must be followed consistently when adding or modifying any part of this
repository. Read it before making changes.

---

## Project overview

FloodGate is a **high-frequency instrumentation analysis platform** for
400 kHz–1 MHz acquisition systems. Events are 0.5–2 s captures but may be longer and lower sample rate or in the future higher sample rate (15Mhz or more) with many
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
---

## nginx routing conventions

`nginx.conf` is the BFF gateway. It proxies API calls from the SPA without
exposing raw service ports or requiring the browser to manage auth headers.

## MinIO / object storage conventions

Bucket: `floodgate-waveforms`
Object key schema: `{testId}/{eventId}/{channelId}.fgw`

### FGW binary format

Waveforms are stored as FloodGate Waveform (`.fgw`) binary files: a 128-byte
fixed little-endian header followed by a contiguous `float32` sample array.

**Header layout (128 bytes, all little-endian):**

| Offset | Size | Field | Type |
|--------|------|-------|------|
| 0 | 4 | magic | `"FGW\x01"` |
| 4 | 2 | version_major | uint16 (1) |
| 6 | 2 | version_minor | uint16 (0) |
| 8 | 4 | header_size | uint32 (128) |
| 12 | 4 | flags | uint32 (bit 0: HAS_DECIMATION) |
| 16 | 8 | n_samples | uint64 |
| 24 | 8 | sample_rate | float64 |
| 32 | 8 | start_time | float64 |
| 40 | 1 | value_dtype | uint8 (1=float32, 2=float64) |
| 41 | 1 | n_decimation_tiers | uint8 |
| 42 | 1 | unit_length | uint8 |
| 43 | 15 | unit | utf8, null-padded |
| 58 | 1 | event_id_length | uint8 |
| 59 | 31 | event_id | utf8, null-padded |
| 90 | 1 | channel_id_length | uint8 |
| 91 | 15 | channel_id | utf8, null-padded |
| 106 | 1 | test_id_length | uint8 |
| 107 | 21 | test_id | utf8, null-padded |
| 128 | … | float32 sample data | n_samples × 4 bytes |

---

## Adding a new service — checklist

1. **Create `services/<name>/`** with the standard layout for the language.
2. **Copy the auth module** from an existing service and adapt env var names.
3. **Add `/health`** endpoint — unauthenticated, returns `{"status":"ok"}`.
4. **Write a multi-stage `Dockerfile`** 
5. **Write a `.dockerignore`** excluding dev artefacts.
6. **Add a `location` block** in `nginx.conf` before the generic `/api/` block.
7. **Add the service to `docker-compose.yml`** with:
   - `security_opt`, `cap_drop`, `read_only`, `tmpfs`, `deploy.resources`
   - `depends_on: keycloak: condition: service_healthy`
   - A `healthcheck` using the `/health` endpoint

---

## Compute service design

The compute service (`services/compute-service/`) performs server-side signal
analysis on waveform data.  It fetches raw samples directly from MinIO (same
bucket as waveform-service) to avoid inter-service HTTP round-trips.
