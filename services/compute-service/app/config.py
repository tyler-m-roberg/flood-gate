"""
Application configuration via environment variables.

All settings have sane defaults for local development; override via .env or
environment variables for staging/production.
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
    service_name: str = "floodgate-compute"
    environment: Literal["development", "staging", "production"] = "development"
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"
    port: int = 8003

    # ── CORS ───────────────────────────────────────────────────────────────────
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
    keycloak_client_id: str = "floodgate-compute"

    # JWT validation settings
    jwt_audience: str = ""  # defaults to keycloak_client_id if blank
    jwt_algorithms: list[str] = ["RS256"]
    jwks_cache_ttl: int = 300
    jwt_verify_audience: bool = True
    keycloak_issuer_override: str = ""
    keycloak_external_url: str = "http://localhost:8080"

    # ── BFF session cookie ─────────────────────────────────────────────────────
    cookie_auth_enabled: bool = True
    session_cookie_name: str = "session_token"

    # ── MinIO / object storage ─────────────────────────────────────────────────
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_use_tls: bool = False
    minio_bucket: str = "floodgate-waveforms"

    # ── Derived helpers ────────────────────────────────────────────────────────
    @property
    def keycloak_issuer(self) -> str:
        if self.keycloak_issuer_override:
            return self.keycloak_issuer_override
        base = str(self.keycloak_url).rstrip("/")
        return f"{base}/realms/{self.keycloak_realm}"

    @property
    def keycloak_openid_config_url(self) -> str:
        base = str(self.keycloak_url).rstrip("/")
        return f"{base}/realms/{self.keycloak_realm}/.well-known/openid-configuration"

    @property
    def effective_jwt_audience(self) -> str:
        return self.jwt_audience or self.keycloak_client_id


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
