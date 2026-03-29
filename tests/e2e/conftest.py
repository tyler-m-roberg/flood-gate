"""
Playwright E2E test fixtures for FloodGate.

Requires the full Docker Compose stack running:
    docker compose up --build

Run tests:
    pytest tests/e2e/ --headed          # watch in browser
    pytest tests/e2e/ -v                # headless
"""

import pytest
from playwright.sync_api import Page, BrowserContext, Browser


BASE_URL = "http://localhost:3000"
KEYCLOAK_URL = "http://localhost:8080"

# Pre-configured Keycloak test users (from floodgate-realm.json)
USERS = {
    "admin":   {"username": "admin",   "password": "admin"},
    "analyst": {"username": "analyst", "password": "analyst"},
    "viewer":  {"username": "viewer",  "password": "viewer"},
}

# Mock data IDs
TEST_IDS = {
    "fatigue":   "TEST-2024-001",
    "pressure":  "TEST-2024-002",
    "composite": "TEST-2025-001",
    "weld":      "TEST-2025-002",
}


def keycloak_login(page: Page, username: str, password: str) -> None:
    """
    Complete the Keycloak OIDC login flow.

    Navigates to the app, follows the BFF redirect chain to Keycloak,
    fills credentials, and waits for the redirect back to the app with
    a valid session cookie.
    """
    page.goto(BASE_URL)

    # The BFF auth flow redirects: app -> /api/v1/auth/login -> Keycloak
    # Wait for the Keycloak login form to appear
    page.wait_for_url(f"{KEYCLOAK_URL}/**", timeout=30_000)

    page.fill("#username", username)
    page.fill("#password", password)
    page.click("#kc-login")

    # Wait for redirect back to the app after successful auth
    page.wait_for_url(f"{BASE_URL}/**", timeout=30_000)

    # Verify we're authenticated: the user menu should be visible
    page.wait_for_selector("text=Tests", timeout=10_000)


@pytest.fixture(scope="session")
def browser_context_args():
    """Override default browser context args."""
    return {
        "viewport": {"width": 1920, "height": 1080},
        "ignore_https_errors": True,
    }


@pytest.fixture
def authenticated_page(page: Page) -> Page:
    """A page that has completed Keycloak login as admin."""
    keycloak_login(page, USERS["admin"]["username"], USERS["admin"]["password"])
    return page


@pytest.fixture
def workspace_page(authenticated_page: Page) -> Page:
    """
    An authenticated page navigated to the workspace for TEST-2025-001
    (Composite Impact Matrix) with one event loaded.
    """
    page = authenticated_page
    test_id = TEST_IDS["composite"]

    # Navigate to test events page
    page.goto(f"{BASE_URL}/test/{test_id}")
    page.wait_for_selector("text=Composite Impact Matrix", timeout=15_000)

    # Double-click the first event row to open it in the workspace
    first_event = page.locator("text=EVT-001").first
    first_event.dblclick()

    # Wait for workspace to load
    page.wait_for_url(f"**/workspace/{test_id}**", timeout=15_000)

    # Wait for the event data to finish loading (spinner disappears)
    page.wait_for_selector("text=Loading", state="hidden", timeout=30_000)

    return page
