# ── FloodGate mock waveform loader ────────────────────────────────────────────
# Minimal one-shot image: runs main.py once and exits.
# Final image ≈ 60 MB; runs as UID 1001 (non-root).

FROM python:3.11-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="floodgate-mock-loader" \
      org.opencontainers.image.description="Loads deterministic mock waveforms into MinIO" \
      org.opencontainers.image.source="https://github.com/tyler-m-roberg/flood-gate"

RUN groupadd --system --gid 1001 appgroup \
    && useradd  --system --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=shared fgw.py .
COPY main.py .

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random

USER appuser

CMD ["python", "main.py"]
