# ── FloodGate UI ───────────────────────────────────────────────────────────────
# Multi-stage: Node 22 builder → nginx-unprivileged runtime
# Final image ≈ 25 MB; runs as UID 101 (non-root) on port 8080.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Layer-cache: install deps before copying source so this layer is only
# invalidated when package.json / package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy only what Vite needs to build
COPY index.html vite.config.ts tsconfig*.json ./
COPY src/   ./src/
COPY public/ ./public/

RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="floodgate-ui" \
      org.opencontainers.image.description="FloodGate instrumentation analysis SPA" \
      org.opencontainers.image.source="https://github.com/tyler-m-roberg/flood-gate"

# Drop the default catch-all config; ours lives in conf.d/app.conf
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf

# Static assets produced by the Vite build
COPY --from=builder /build/dist /usr/share/nginx/html

# nginxinc/nginx-unprivileged already:
#   • runs as UID/GID 101 (nginx)
#   • listens on port 8080
#   • writes pid / temp files to /tmp
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO /dev/null http://localhost:8080/health || exit 1
