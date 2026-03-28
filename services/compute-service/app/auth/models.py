"""Auth domain models — the decoded principal attached to every request."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class Role(StrEnum):
    VIEWER = "viewer"
    ANALYST = "analyst"
    ADMIN = "admin"


class TokenClaims(BaseModel):
    """Raw validated JWT claims (Keycloak-shaped)."""

    sub: str
    preferred_username: str = ""
    email: str = ""
    name: str = ""
    email_verified: bool = False

    # Keycloak puts realm-level roles here
    realm_access: dict[str, list[str]] = Field(default_factory=dict)
    # Keycloak puts per-client roles here, keyed by client_id
    resource_access: dict[str, dict[str, list[str]]] = Field(default_factory=dict)
    # Custom mapper: client scope "groups" maps Keycloak groups into this claim
    groups: list[str] = Field(default_factory=list)

    # Standard JWT claims
    iss: str = ""
    aud: str | list[str] = Field(default_factory=list)
    exp: int = 0
    iat: int = 0
    jti: str = ""
    azp: str = ""

    model_config = {"extra": "allow"}


class CurrentUser(BaseModel):
    """Resolved principal attached to request.state after auth."""

    subject: str
    username: str
    email: str
    name: str
    roles: frozenset[Role]
    groups: frozenset[str]
    is_service_account: bool = False

    def has_role(self, *roles: Role) -> bool:
        return bool(self.roles.intersection(roles))

    def in_group(self, group: str) -> bool:
        return group in self.groups

    @property
    def is_admin(self) -> bool:
        return Role.ADMIN in self.roles

    @property
    def is_analyst(self) -> bool:
        return Role.ANALYST in self.roles or self.is_admin

    @property
    def is_viewer(self) -> bool:
        return len(self.roles) > 0
