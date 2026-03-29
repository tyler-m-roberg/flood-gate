"""
Backend-for-Frontend (BFF) authentication router.

Handles the OIDC authorization code flow server-side so the SPA never touches
tokens directly.  After successful authentication the access token is placed
in an HttpOnly cookie that all subsequent API requests include automatically.

Endpoints
---------
GET  /auth/config    — public Keycloak discovery info (no secrets)
GET  /auth/login     — redirect to Keycloak login page
GET  /auth/callback  — exchange authorization code for tokens, set cookie
POST /auth/logout    — clear session cookie and redirect to Keycloak logout
GET  /auth/me        — return current user profile from session cookie
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import Settings, get_settings

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _fetch_oidc_config(settings: Settings) -> dict:
    """Fetch OIDC discovery from Keycloak (server-side, internal URL)."""
    base = str(settings.keycloak_url).rstrip("/")
    url = f"{base}/realms/{settings.keycloak_realm}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


def _to_external_url(internal_url: str, settings: Settings) -> str:
    """
    Replace internal Keycloak hostname with browser-facing URL.

    Browser redirects need the external URL (e.g. http://localhost:8080).
    """
    internal_base = str(settings.keycloak_url).rstrip("/")
    external_base = settings.keycloak_external_url.rstrip("/")
    return internal_url.replace(internal_base, external_base)


def _to_internal_url(external_url: str, settings: Settings) -> str:
    """
    Replace browser-facing Keycloak hostname with internal container URL.

    Server-to-server calls (token exchange, JWKS fetch) must use the internal
    Docker network URL (e.g. http://keycloak:8080).
    """
    external_base = settings.keycloak_external_url.rstrip("/")
    internal_base = str(settings.keycloak_url).rstrip("/")
    return external_url.replace(external_base, internal_base)


def _generate_pkce() -> tuple[str, str]:
    """Generate a PKCE code_verifier and code_challenge (S256)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # HTTP in dev; set True in production
        path="/",
        max_age=1800,
    )


def _clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        samesite="lax",
        secure=False,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/config")
async def auth_config():
    """
    Return public Keycloak realm configuration.

    The SPA uses this to discover auth endpoints without hardcoded URLs.
    No secrets are exposed.
    """
    settings = get_settings()
    return {
        "keycloak_url": settings.keycloak_external_url,
        "realm": settings.keycloak_realm,
        "issuer": settings.keycloak_external_issuer,
        "login_url": "/api/v1/auth/login",
        "logout_url": "/api/v1/auth/logout",
        "me_url": "/api/v1/auth/me",
    }


@router.get("/login")
async def auth_login(request: Request, redirect_uri: str | None = None):
    """
    Initiate the OIDC authorization code flow.

    Generates PKCE, stores verifier in a temporary cookie, and redirects
    the user to Keycloak's login page.
    """
    settings = get_settings()
    oidc_config = await _fetch_oidc_config(settings)

    # Get the authorization endpoint and convert to browser-facing URL
    auth_endpoint = _to_external_url(
        oidc_config["authorization_endpoint"], settings,
    )

    verifier, challenge = _generate_pkce()
    final_redirect = redirect_uri or "/"
    callback_url = f"{settings.bff_app_url}/api/v1/auth/callback"

    params = {
        "response_type": "code",
        "client_id": settings.bff_client_id,
        "redirect_uri": callback_url,
        "scope": "openid profile email",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": final_redirect,
    }

    redirect_url = f"{auth_endpoint}?{urlencode(params)}"
    response = RedirectResponse(url=redirect_url, status_code=302)

    response.set_cookie(
        key="pkce_verifier",
        value=verifier,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/api/v1/auth/callback",
        max_age=600,
    )

    return response


@router.get("/callback")
async def auth_callback(request: Request, code: str | None = None, state: str | None = None):
    """
    Handle the OIDC callback from Keycloak.

    Exchanges the authorization code for tokens (server-side using internal URL),
    sets the session cookie, and redirects to the SPA.
    """
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    settings = get_settings()
    verifier = request.cookies.get("pkce_verifier")
    if not verifier:
        raise HTTPException(status_code=400, detail="Missing PKCE verifier — restart login")

    oidc_config = await _fetch_oidc_config(settings)
    # Token exchange is server-to-server → convert to internal URL
    token_endpoint = _to_internal_url(oidc_config["token_endpoint"], settings)

    callback_url = f"{settings.bff_app_url}/api/v1/auth/callback"

    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            token_endpoint,
            data={
                "grant_type": "authorization_code",
                "client_id": settings.bff_client_id,
                "client_secret": settings.bff_client_secret,
                "code": code,
                "redirect_uri": callback_url,
                "code_verifier": verifier,
            },
        )

    if token_response.status_code != 200:
        log.warning(
            "auth.callback_failed",
            status=token_response.status_code,
            body=token_response.text[:200],
        )
        raise HTTPException(status_code=401, detail="Token exchange failed")

    tokens = token_response.json()
    access_token = tokens.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="No access token in response")

    final_redirect = state or "/"
    if not final_redirect.startswith("/"):
        final_redirect = "/"

    response = RedirectResponse(url=final_redirect, status_code=302)
    _set_session_cookie(response, settings, access_token)

    response.delete_cookie(
        key="pkce_verifier",
        path="/api/v1/auth/callback",
        httponly=True,
        samesite="lax",
    )

    log.info("auth.login_success", state=final_redirect)
    return response


@router.post("/logout")
async def auth_logout(request: Request):
    """
    Clear session cookie and redirect to Keycloak's end-session endpoint.
    """
    settings = get_settings()
    oidc_config = await _fetch_oidc_config(settings)
    end_session = oidc_config.get("end_session_endpoint")

    response = RedirectResponse(url="/", status_code=302)

    if end_session:
        # Browser redirect → use external URL
        external_end_session = _to_external_url(end_session, settings)
        params = {
            "client_id": settings.bff_client_id,
            "post_logout_redirect_uri": settings.bff_app_url,
        }
        response = RedirectResponse(
            url=f"{external_end_session}?{urlencode(params)}",
            status_code=302,
        )

    _clear_session_cookie(response, settings)
    return response


@router.get("/me")
async def auth_me(request: Request):
    """
    Return the current user's profile from the session cookie.

    Returns 401 if no valid session exists.
    """
    settings = get_settings()
    raw_token = request.cookies.get(settings.session_cookie_name)

    if not raw_token:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"authenticated": False},
        )

    try:
        from app.auth.dependencies import _get_or_create_validator
        validator = _get_or_create_validator(settings)
        user = await validator.validate(raw_token)

        return {
            "authenticated": True,
            "subject": user.subject,
            "username": user.username,
            "email": user.email,
            "name": user.name,
            "roles": [r.value for r in user.roles],
            "groups": list(user.groups),
            "is_service_account": user.is_service_account,
        }
    except Exception as exc:
        log.warning("auth.me_failed", error=str(exc), error_type=type(exc).__name__)
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"authenticated": False, "error": "Invalid or expired session"},
        )
