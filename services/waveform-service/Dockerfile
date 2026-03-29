# ── FloodGate Waveform Service ─────────────────────────────────────────────────
# Multi-stage: Go 1.23 builder (alpine) → alpine runtime
# Final image ≈ 20 MB; runs as UID 1001 (non-root) on port 8002.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

# git is needed by go mod download for VCS-based modules
RUN apk add --no-cache ca-certificates git

WORKDIR /build

# Allow the build to download and record dependencies without a pre-committed
# go.sum (prototype workflow). In production, commit go.sum and remove GONOSUMDB.
ENV CGO_ENABLED=0 \
    GONOSUMDB="*" \
    GOFLAGS="-mod=mod"

# Layer-cache: resolve modules before copying source so this layer is only
# invalidated when go.mod changes.
COPY go.mod .
RUN go mod download 2>/dev/null || true

COPY . .

RUN go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /bin/waveform-service \
    ./cmd/server/

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime

LABEL org.opencontainers.image.title="floodgate-waveform" \
      org.opencontainers.image.description="FloodGate high-frequency waveform data service" \
      org.opencontainers.image.source="https://github.com/tyler-m-roberg/flood-gate"

# ca-certificates  — TLS for Keycloak JWKS fetch in production
# wget             — used by the HEALTHCHECK
RUN apk add --no-cache ca-certificates wget \
    && addgroup -S -g 1001 appgroup \
    && adduser  -S -u 1001 -G appgroup -H appuser

COPY --from=builder /bin/waveform-service /usr/local/bin/waveform-service

ENV PORT=8002 \
    ENVIRONMENT=production

USER appuser

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO /dev/null http://localhost:8002/health || exit 1

CMD ["/usr/local/bin/waveform-service"]
