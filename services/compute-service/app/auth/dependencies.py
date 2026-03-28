"""
FastAPI dependency injection for authentication and authorisation.

Two token sources are supported transparently on every secured endpoint:

1. Bearer token  (Authorization: Bearer <jwt>)
2. Session cookie  (cookie: session_token=<jwt>)

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

_bearer_scheme = HTTPBearer(auto_error=False)

_validator_cache: KeycloakTokenValidator | None = None


def _get_or_create_validator(settings: Settings) -> KeycloakTokenValidator:
    global _validator_cache
    if _validator_cache is None:
        _validator_cache = KeycloakTokenValidator(settings)
    return _validator_cache


def get_validator(settings: Settings = Depends(get_settings)) -> KeycloakTokenValidator:
    return _get_or_create_validator(settings)


async def get_current_user(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
    validator: KeycloakTokenValidator = Depends(get_validator),
) -> CurrentUser:
    raw_token: str | None = None
    source: str = "none"

    if bearer and bearer.credentials:
        raw_token = bearer.credentials
        source = "bearer"
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
        log.debug("auth.ok", subject=user.subject, username=user.username, source=source)
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
    try:
        return await get_current_user(request, bearer, settings, validator)
    except HTTPException:
        return None


def require_roles(*roles: Role):
    async def _dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not user.has_role(*roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {[r.value for r in roles]}",
            )
        return user
    return _dependency


def require_analyst():
    return require_roles(Role.ANALYST, Role.ADMIN)


def require_admin():
    return require_roles(Role.ADMIN)
