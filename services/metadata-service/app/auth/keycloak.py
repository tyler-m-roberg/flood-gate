"""
Keycloak JWT validation.

Fetches and caches the realm's JWKS, then verifies incoming JWTs without
calling Keycloak on every request.  Key rotation is handled automatically:
if the kid in the token header isn't in the cached keyset the cache is
invalidated and re-fetched once before raising an error.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import jwt  # PyJWT
import structlog
from jwt import PyJWKClient, PyJWKClientError

from app.auth.models import CurrentUser, Role, TokenClaims
from app.config import Settings, get_settings

log = structlog.get_logger(__name__)


class KeycloakTokenValidator:
    """
    Validates Keycloak-issued JWTs (RS256 by default).

    Usage
    -----
    validator = KeycloakTokenValidator(settings)
    user = await validator.validate(raw_token)

    The validator is designed to be a long-lived singleton (instantiated once
    at startup and reused across requests via the FastAPI dependency system).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._jwks_client: PyJWKClient | None = None
        self._jwks_last_refresh: float = 0.0
        self._openid_config: dict[str, Any] | None = None

    # ── Public API ─────────────────────────────────────────────────────────────

    async def validate(self, raw_token: str) -> CurrentUser:
        """
        Validate a raw JWT string and return a resolved CurrentUser.

        Raises
        ------
        jwt.InvalidTokenError  — for any signature / claim validation failure.
        httpx.HTTPError        — if Keycloak is unreachable while refreshing keys.
        """
        signing_key = await self._get_signing_key(raw_token)

        options: dict[str, Any] = {
            "verify_exp": True,
            "verify_iat": True,
            "verify_iss": True,
            "verify_aud": self._settings.jwt_verify_audience,
        }

        audience = (
            self._settings.effective_jwt_audience
            if self._settings.jwt_verify_audience
            else None
        )

        payload = jwt.decode(
            raw_token,
            signing_key,
            algorithms=self._settings.jwt_algorithms,
            audience=audience,
            issuer=self._settings.keycloak_issuer,
            options=options,
        )

        claims = TokenClaims(**payload)
        return self._build_current_user(claims)

    # ── Internals ──────────────────────────────────────────────────────────────

    async def _get_signing_key(self, raw_token: str) -> Any:
        """Return the signing key for the given token, refreshing JWKS if needed."""
        client = await self._jwks_client_fresh()
        try:
            return client.get_signing_key_from_jwt(raw_token)
        except PyJWKClientError:
            # kid not found in cache — could be a newly rotated key; force refresh
            log.info("jwks.kid_miss", hint="forcing JWKS refresh")
            self._jwks_last_refresh = 0.0
            client = await self._jwks_client_fresh()
            return client.get_signing_key_from_jwt(raw_token)

    async def _jwks_client_fresh(self) -> PyJWKClient:
        """Return JWKS client, re-fetching from Keycloak if the TTL has expired."""
        now = time.monotonic()
        ttl = self._settings.jwks_cache_ttl
        if self._jwks_client is None or (now - self._jwks_last_refresh) > ttl:
            jwks_uri = await self._discover_jwks_uri()
            # PyJWKClient handles HTTP internally; we pass lifespan=0 to disable
            # its own caching so we control it here.
            self._jwks_client = PyJWKClient(jwks_uri, lifespan=0)
            # Force a fetch so the keys are populated
            await _async_fetch_jwks(self._jwks_client)
            self._jwks_last_refresh = now
            log.debug("jwks.refreshed", uri=jwks_uri)
        return self._jwks_client

    async def _discover_jwks_uri(self) -> str:
        """Fetch Keycloak's OpenID Connect discovery document to get jwks_uri."""
        if self._openid_config is None:
            url = self._settings.keycloak_openid_config_url
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                self._openid_config = resp.json()
                log.debug("oidc.discovered", issuer=self._openid_config.get("issuer"))
        return str(self._openid_config["jwks_uri"])

    @staticmethod
    def _build_current_user(claims: TokenClaims) -> CurrentUser:
        """Map raw Keycloak claims to our domain CurrentUser model."""
        settings = get_settings()

        # Collect realm roles
        realm_roles: set[str] = set(claims.realm_access.get("roles", []))

        # Collect per-client roles for this service's client_id
        client_roles: set[str] = set(
            claims.resource_access
            .get(settings.keycloak_client_id, {})
            .get("roles", [])
        )

        all_role_strs = realm_roles | client_roles

        # Map to our Role enum (ignore unmapped Keycloak roles)
        roles: set[Role] = set()
        import contextlib
        for r in all_role_strs:
            with contextlib.suppress(ValueError):
                roles.add(Role(r.lower()))

        # Normalise group paths: strip leading "/" if present
        groups = {g.lstrip("/") for g in claims.groups}

        # Service accounts (client_credentials) have "service-account-" prefix username
        is_service = claims.preferred_username.startswith("service-account-")

        return CurrentUser(
            subject=claims.sub,
            username=claims.preferred_username or claims.sub,
            email=claims.email,
            name=claims.name,
            roles=frozenset(roles),
            groups=frozenset(groups),
            is_service_account=is_service,
        )


# PyJWKClient is synchronous internally; we run its fetch in a thread pool
# so it doesn't block the async event loop.
async def _async_fetch_jwks(client: PyJWKClient) -> None:
    import asyncio

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, client.fetch_data)
