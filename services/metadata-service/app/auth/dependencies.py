"""
FastAPI dependency injection for authentication and authorisation.

Two token sources are supported transparently on every secured endpoint:

1. Bearer token  (Authorization: Bearer <jwt>)
   Used by the React SPA after a PKCE login, by machine clients using
   client-credentials grant, and by other microservices calling this API.

2. Session cookie  (cookie: session_token=<jwt>)
   Used when a BFF proxy (e.g. the React dev server or a dedicated BFF
   service) performs the OIDC flow server-side and plants the Keycloak
   access token in a HttpOnly cookie.  The cookie name is configurable.

If both are present, Bearer token takes precedence.

If neither is present and the endpoint requires auth, a 401 is returned.
"""

from __future__ import annotations

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.keycloak import KeycloakTokenValidator
from app.auth.models import CurrentUser, Role
from app.config import Settings, get_settings

log = structlog.get_logger(__name__)

# ── Singletons ─────────────────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)


def get_validator(settings: Settings = Depends(get_settings)) -> KeycloakTokenValidator:
    """
    Return the per-process JWKS validator singleton.

    We store it on app.state so it's created once at startup and reused.
    A fallback constructs it on the first call (useful in tests).
    """
    # We attach the validator to app.state in main.py lifespan; fall back to
    # constructing one here in test / local scenarios.
    return _get_or_create_validator(settings)


_validator_cache: KeycloakTokenValidator | None = None


def _get_or_create_validator(settings: Settings) -> KeycloakTokenValidator:
    global _validator_cache
    if _validator_cache is None:
        _validator_cache = KeycloakTokenValidator(settings)
    return _validator_cache


# ── Core auth dependency ───────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
    validator: KeycloakTokenValidator = Depends(get_validator),
) -> CurrentUser:
    """
    Resolve the authenticated user from a Bearer token or session cookie.

    Raises HTTP 401 if no valid credential is present.
    Raises HTTP 403 if the token is present but invalid/expired.
    """
    raw_token: str | None = None
    source: str = "none"

    # 1. Bearer token takes priority
    if bearer and bearer.credentials:
        raw_token = bearer.credentials
        source = "bearer"

    # 2. Fall back to session cookie (BFF mode)
    elif settings.cookie_auth_enabled:
        cookie_val = request.cookies.get(settings.session_cookie_name)
        if cookie_val:
            raw_token = cookie_val
            source = "cookie"

    if raw_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = await validator.validate(raw_token)
        log.debug(
            "auth.ok",
            subject=user.subject,
            username=user.username,
            source=source,
            is_service=user.is_service_account,
        )
        # Attach to request.state for middleware / logging
        request.state.current_user = user
        return user

    except Exception as exc:
        log.warning("auth.failed", source=source, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user_optional(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
    validator: KeycloakTokenValidator = Depends(get_validator),
) -> CurrentUser | None:
    """
    Like get_current_user but returns None instead of raising for unauthenticated
    requests.  Useful for endpoints that serve public data with optional
    enrichment for authenticated users.
    """
    try:
        return await get_current_user(request, bearer, settings, validator)
    except HTTPException:
        return None


# ── Role-based authorisation helpers ──────────────────────────────────────────

def require_roles(*roles: Role):
    """
    Factory that returns a FastAPI dependency enforcing role membership.

    Usage
    -----
    @router.get("/admin-only")
    async def admin_only(user: CurrentUser = Depends(require_roles(Role.ADMIN))):
        ...
    """
    async def _dependency(
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if not user.has_role(*roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {[r.value for r in roles]}",
            )
        return user
    return _dependency


def require_analyst():
    """Shorthand: require analyst or admin."""
    return require_roles(Role.ANALYST, Role.ADMIN)


def require_admin():
    """Shorthand: require admin."""
    return require_roles(Role.ADMIN)


# ── Group-based access ─────────────────────────────────────────────────────────

def require_group(group: str):
    """
    Enforce group membership.  Admins bypass group checks.
    """
    async def _dependency(
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if user.is_admin:
            return user
        if not user.in_group(group):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Group membership required: {group!r}",
            )
        return user
    return _dependency
