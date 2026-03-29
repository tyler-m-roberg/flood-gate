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
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._jwks_client: PyJWKClient | None = None
        self._jwks_last_refresh: float = 0.0
        self._openid_config: dict[str, Any] | None = None

    async def validate(self, raw_token: str) -> CurrentUser:
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

    async def _get_signing_key(self, raw_token: str) -> Any:
        client = await self._jwks_client_fresh()
        try:
            return client.get_signing_key_from_jwt(raw_token)
        except PyJWKClientError:
            log.info("jwks.kid_miss", hint="forcing JWKS refresh")
            self._jwks_last_refresh = 0.0
            client = await self._jwks_client_fresh()
            return client.get_signing_key_from_jwt(raw_token)

    async def _jwks_client_fresh(self) -> PyJWKClient:
        now = time.monotonic()
        ttl = self._settings.jwks_cache_ttl
        if self._jwks_client is None or (now - self._jwks_last_refresh) > ttl:
            jwks_uri = await self._discover_jwks_uri()
            self._jwks_client = PyJWKClient(jwks_uri, lifespan=ttl)
            await _async_fetch_jwks(self._jwks_client)
            self._jwks_last_refresh = now
            log.debug("jwks.refreshed", uri=jwks_uri)
        return self._jwks_client

    async def _discover_jwks_uri(self) -> str:
        if self._openid_config is None:
            url = self._settings.keycloak_openid_config_url
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                self._openid_config = resp.json()
                log.debug("oidc.discovered", issuer=self._openid_config.get("issuer"))
        jwks_uri = str(self._openid_config["jwks_uri"])
        external_base = self._settings.keycloak_external_url.rstrip("/")
        internal_base = str(self._settings.keycloak_url).rstrip("/")
        return jwks_uri.replace(external_base, internal_base)

    @staticmethod
    def _build_current_user(claims: TokenClaims) -> CurrentUser:
        settings = get_settings()

        realm_roles: set[str] = set(claims.realm_access.get("roles", []))
        client_roles: set[str] = set(
            claims.resource_access
            .get(settings.keycloak_client_id, {})
            .get("roles", [])
        )

        all_role_strs = realm_roles | client_roles

        roles: set[Role] = set()
        import contextlib
        for r in all_role_strs:
            with contextlib.suppress(ValueError):
                roles.add(Role(r.lower()))

        groups = {g.lstrip("/") for g in claims.groups}
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


async def _async_fetch_jwks(client: PyJWKClient) -> None:
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, client.fetch_data)
