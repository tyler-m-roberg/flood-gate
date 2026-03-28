"""
FloodGate Compute Service
=========================

FastAPI application entrypoint.

Provides signal analysis endpoints (FFT, PSD, RMS envelope) that operate on
waveform data fetched directly from MinIO object storage.

Authentication
--------------
All routes under /api/v1/compute require a valid Keycloak JWT supplied as:

  Authorization: Bearer <access_token>

or as an HttpOnly session cookie when using the nginx BFF proxy:

  Cookie: session_token=<access_token>

Bearer token takes precedence when both are present.

Running locally
---------------
  uvicorn app.main:app --reload --port 8003

With audience verification disabled (dev, before Keycloak is configured):
  JWT_VERIFY_AUDIENCE=false uvicorn app.main:app --reload --port 8003
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth.dependencies import _get_or_create_validator
from app.config import get_settings
from app.middleware import RequestLoggingMiddleware, configure_structlog
from app.models.compute import HealthOut
from app.routers import api_router

settings = get_settings()
configure_structlog(settings.log_level)
log = structlog.get_logger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "startup",
        service=settings.service_name,
        environment=settings.environment,
        keycloak_issuer=settings.keycloak_issuer,
        minio_endpoint=settings.minio_endpoint,
        minio_bucket=settings.minio_bucket,
    )

    validator = _get_or_create_validator(settings)
    app.state.token_validator = validator

    # Pre-warm JWKS — non-fatal in dev (first real request will retry)
    if settings.environment != "development":
        try:
            await validator._discover_jwks_uri()
            log.info("jwks.warmed", issuer=settings.keycloak_issuer)
        except Exception as exc:
            log.warning("jwks.warmup_failed", error=str(exc), hint="will retry on first auth")

    yield

    log.info("shutdown", service=settings.service_name)


# ── Application ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FloodGate Compute Service",
    description=(
        "Signal analysis API — FFT, Power Spectral Density, and RMS envelope "
        "for high-frequency waveform data.  "
        "Secured with Keycloak OIDC — accepts Bearer token or session cookie."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ── Middleware ─────────────────────────────────────────────────────────────────

app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


# ── Error handlers ─────────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_error", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "request_id": getattr(request.state, "request_id", None),
        },
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthOut,
    tags=["health"],
    summary="Service health check",
    include_in_schema=True,
)
async def health() -> HealthOut:
    """Liveness probe — no auth required."""
    return HealthOut(
        status="ok",
        service=settings.service_name,
        version="0.1.0",
        environment=settings.environment,
    )


app.include_router(api_router, prefix=settings.api_prefix)
