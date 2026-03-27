# ── FloodGate Metadata Service ────────────────────────────────────────────────
# Multi-stage build: slim production image ~150 MB

# ── Stage 1: build / install dependencies ─────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build tools needed by some native extensions (cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest first to leverage Docker layer caching
COPY pyproject.toml .

# Create a venv and install deps into it
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir .

# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL org.opencontainers.image.title="floodgate-metadata"
LABEL org.opencontainers.image.description="FloodGate metadata REST API"

# Non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

WORKDIR /app

# Copy the venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application source
COPY app/ ./app/

# Ensure Python doesn't write .pyc files to the container layer
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production

USER appuser

EXPOSE 8001

# Uvicorn with 2 workers per CPU (tune via UVICORN_WORKERS env var)
CMD ["sh", "-c", \
     "uvicorn app.main:app \
       --host 0.0.0.0 \
       --port 8001 \
       --workers ${UVICORN_WORKERS:-2} \
       --loop uvloop \
       --access-log"]
