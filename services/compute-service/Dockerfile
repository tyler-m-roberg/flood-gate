# ── FloodGate Compute Service ──────────────────────────────────────────────────
# Multi-stage build: build-time numpy/scipy compilation → slim production runtime.
# numpy and scipy ship pre-compiled wheels on PyPI for linux/amd64 and linux/arm64,
# so the build stage mostly downloads wheels rather than compiling from source.
# Final image ≈ 400 MB (numpy + scipy wheels are large but unavoidable).
# Runs as UID/GID 1001 (non-root) on port 8003.

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS builder

WORKDIR /build

# gcc + libffi for the cryptography wheel (required by PyJWT[crypto]);
# numpy and scipy use pre-compiled manylinux wheels so no Fortran needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Layer-cache: only invalidate the install step when dependencies change.
COPY pyproject.toml .

RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade --no-cache-dir pip \
    && /opt/venv/bin/pip install --no-cache-dir .

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="floodgate-compute" \
      org.opencontainers.image.description="FloodGate signal analysis compute service (FFT, PSD, envelope)" \
      org.opencontainers.image.source="https://github.com/tyler-m-roberg/flood-gate"

# Dedicated non-root user with explicit UID/GID for auditability
RUN groupadd --system --gid 1001 appgroup \
    && useradd  --system --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

# Copy pre-built venv from the installer stage (no build tools in runtime image)
COPY --from=builder /opt/venv /opt/venv

# Copy application source (invalidates only this layer on source changes)
COPY app/ ./app/

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    ENVIRONMENT=production

USER appuser

EXPOSE 8003

# HEALTHCHECK uses Python stdlib — no extra tooling required in the slim image
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8003/health').read()"

# Exec-form CMD: PID 1 receives SIGTERM directly for clean shutdown.
# Override UVICORN_WORKERS via compose environment or `docker run -e`.
CMD ["sh", "-c", \
     "uvicorn app.main:app \
        --host 0.0.0.0 \
        --port 8003 \
        --workers ${UVICORN_WORKERS:-2} \
        --loop uvloop"]
