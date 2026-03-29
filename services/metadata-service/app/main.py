"""
FloodGate Metadata Service
==========================

FastAPI application entrypoint.

Authentication
--------------
Every route under /api/v1 requires a valid Keycloak JWT supplied either as:

  Authorization: Bearer <access_token>

or, when the React app uses a BFF proxy, as an HttpOnly session cookie:

  Cookie: session_token=<access_token>

Bearer token takes precedence when both are present.

Token types supported:
  • User tokens   — issued via PKCE flow in the React SPA
  • Service tokens — issued via client_credentials grant for machine-to-machine

Running locally
---------------
  uvicorn app.main:app --reload --port 8001

With auth disabled (dev shortcut via env):
  KEYCLOAK_URL=http://localhost:8080 JWT_VERIFY_AUDIENCE=false uvicorn app.main:app --reload
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
from app.db.engine import dispose_engine, init_engine
from app.storage.minio_client import init_minio
from app.middleware import RequestLoggingMiddleware, configure_structlog
from app.models.domain import HealthOut
from app.routers import api_router

settings = get_settings()
configure_structlog(settings.log_level)
log = structlog.get_logger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: warm the JWKS cache so the first request doesn't block.
    Shutdown: nothing to clean up (stateless service).
    """
    log.info(
        "startup",
        service=settings.service_name,
        environment=settings.environment,
        keycloak_issuer=settings.keycloak_issuer,
        use_mock_data=settings.use_mock_data,
    )

    # Pre-warm JWKS if Keycloak is reachable.  Failure is non-fatal in dev
    # (first real request will retry).
    validator = _get_or_create_validator(settings)
    app.state.token_validator = validator

    if settings.environment != "development" or not settings.use_mock_data:
        try:
            await validator._discover_jwks_uri()
            log.info("jwks.warmed", issuer=settings.keycloak_issuer)
        except Exception as exc:
            log.warning("jwks.warmup_failed", error=str(exc), hint="will retry on first auth")

    # Initialise the async database engine when not using mock data
    if not settings.use_mock_data:
        init_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=settings.db_pool_recycle,
        )
        # Log host only — never log credentials
        db_host = settings.database_url.split("@")[-1] if "@" in settings.database_url else "local"
        log.info("db.engine_initialised", host=db_host)

        # Initialise MinIO client for waveform uploads
        init_minio(settings)

    yield

    if not settings.use_mock_data:
        await dispose_engine()
        log.info("db.engine_disposed")

    log.info("shutdown", service=settings.service_name)


# ── Application ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FloodGate Metadata Service",
    description=(
        "REST API for test campaigns, events, and channel catalogue. "
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
    allow_credentials=True,       # required for cookie-based BFF auth
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-Total-Count"],
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
    """
    Liveness probe — no auth required.
    Returns 200 if the service is up.
    """
    return HealthOut(
        status="ok",
        service=settings.service_name,
        version="0.1.0",
        environment=settings.environment,
    )


# All versioned API routes — each requires authentication (enforced per-router)
app.include_router(api_router, prefix=settings.api_prefix)
