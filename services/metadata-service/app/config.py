"""
Application configuration via environment variables.

All settings have sane defaults for local development; override via .env or
environment for staging/production.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Service ────────────────────────────────────────────────────────────────
    service_name: str = "floodgate-metadata"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"

    # ── CORS ───────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins, e.g. "http://localhost:5173,https://app.example.com"
    cors_origins: list[str] = Field(default=["http://localhost:5173"])

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    # ── Keycloak / OIDC ────────────────────────────────────────────────────────
    keycloak_url: AnyHttpUrl = Field(default="http://localhost:8080")
    keycloak_realm: str = "floodgate"
    keycloak_client_id: str = "floodgate-metadata"

    # Optional client secret — required when the metadata service itself needs
    # to call Keycloak APIs (e.g. introspection, user lookup).
    keycloak_client_secret: str = ""

    # JWT validation settings
    # Audience claim the token must contain. Set to the client_id by default.
    # Use "account" if your Keycloak realm issues tokens without resource audience.
    jwt_audience: str = ""                # defaults to keycloak_client_id if blank
    jwt_algorithms: list[str] = ["RS256"]
    # How many seconds to cache the JWKS before re-fetching (handles key rotation)
    jwks_cache_ttl: int = 300
    # Whether to require a verified audience claim (set False for dev if needed)
    jwt_verify_audience: bool = True

    # ── BFF session cookie ─────────────────────────────────────────────────────
    # When the React app uses a backend-for-frontend proxy that forwards a signed
    # session cookie instead of a raw Bearer token, the BFF signs the access token
    # inside a cookie named `session_token`.  Set cookie_auth_enabled=True to
    # enable this path.  The cookie value is expected to be a raw Keycloak JWT.
    cookie_auth_enabled: bool = True
    session_cookie_name: str = "session_token"

    # ── Database ───────────────────────────────────────────────────────────────
    # SQLite (dev/test) or PostgreSQL (prod).
    # Example: "postgresql+asyncpg://user:pass@host:5432/floodgate"
    database_url: str = "sqlite+aiosqlite:///./floodgate_meta.db"
    # Use in-memory mock data instead of the database (prototype mode)
    use_mock_data: bool = True

    # ── Derived helpers ────────────────────────────────────────────────────────
    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}"

    @property
    def keycloak_openid_config_url(self) -> str:
        return f"{self.keycloak_issuer}/.well-known/openid-configuration"

    @property
    def effective_jwt_audience(self) -> str:
        return self.jwt_audience or self.keycloak_client_id


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
