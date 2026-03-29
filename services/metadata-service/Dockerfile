# ── FloodGate Metadata Service ────────────────────────────────────────────────
# Multi-stage build: dependency installer → slim production runtime.
# Final image ≈ 180 MB; runs as UID/GID 1001 (non-root) on port 8001.

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS builder

WORKDIR /build

# Build tools required by native extensions (cryptography, psycopg2)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev libssl-dev libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Layer-cache: install only when pyproject.toml changes.
# pip install reads [project].dependencies and installs them into the venv.
# The package itself (floodgate-metadata) has no runtime import side-effects
# from being pre-installed here; the real app source is copied at runtime stage.
COPY pyproject.toml .

RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade --no-cache-dir pip \
    && /opt/venv/bin/pip install --no-cache-dir .

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="floodgate-metadata" \
      org.opencontainers.image.description="FloodGate metadata REST API" \
      org.opencontainers.image.source="https://github.com/tyler-m-roberg/flood-gate"

# Runtime dependency for psycopg2 (PostgreSQL client library)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Dedicated non-root user with explicit UID/GID for auditability
RUN groupadd --system --gid 1001 appgroup \
    && useradd  --system --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

# Copy pre-built venv from the installer stage (no build tools in runtime image)
COPY --from=builder /opt/venv /opt/venv

# Copy Alembic configuration and migrations
COPY alembic.ini ./
COPY alembic/ ./alembic/

# Copy application source (invalidates this layer on any source change, not deps)
COPY app/ ./app/

ENV PATH="/opt/venv/bin:$PATH" \
    # Prevent .pyc files being written into the container layer
    PYTHONDONTWRITEBYTECODE=1 \
    # Ensure stdout/stderr is not buffered (structlog needs this)
    PYTHONUNBUFFERED=1 \
    # Randomise hash seed to mitigate hash-flooding DoS
    PYTHONHASHSEED=random \
    ENVIRONMENT=production

USER appuser

EXPOSE 8001

# HEALTHCHECK uses Python stdlib — no extra tooling needed in the slim image
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8001/health').read()"

# Run Alembic migrations (if DB is configured), then start uvicorn.
# When USE_MOCK_DATA=true the migration step is skipped.
CMD ["sh", "-c", \
     "if [ \"$USE_MOCK_DATA\" != \"true\" ]; then python -m alembic upgrade head; fi && \
      uvicorn app.main:app \
        --host 0.0.0.0 \
        --port 8001 \
        --workers ${UVICORN_WORKERS:-2} \
        --loop uvloop"]
