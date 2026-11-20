from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.credentials.store import get_secret, has_secret
from app.tools.filesystem import list_directory, sandbox_root


def redact_secrets(text: str) -> str:
    cleaned = re.sub(r"(?i)(key|token|secret)=[^&\s]+", r"\1=[redacted]", text or "")
    cleaned = re.sub(r"(?i)bearer\s+[a-z0-9._\-]+", "Bearer [redacted]", cleaned)
    cleaned = re.sub(r"(?i)sk-[a-z0-9_\-]+", "[redacted]", cleaned)
    return cleaned[:400]


def playwright_available() -> bool:
    try:
        import playwright  # noqa: F401
        return True
    except Exception:
        return False


def _elapsed(started: float) -> int:
    return max(1, int((time.perf_counter() - started) * 1000))


async def probe_integration(integration_id: str) -> dict[str, Any]:
    started = time.perf_counter()
    if integration_id == "integ_local_desktop":
        listing = list_directory("")
        return {
            "status": "success",
            "latency_ms": _elapsed(started),
            "message": f"Sandbox is readable. {len(listing['entries'])} visible entries.",
            "endpoint": str(sandbox_root()),
        }
    if integration_id == "integ_browser":
        if playwright_available():
            return {
                "status": "success",
                "latency_ms": _elapsed(started),
                "message": "Playwright is installed. This check does not open a signed-in browser session.",
            }
        return {
            "status": "unavailable",
            "latency_ms": None,
            "message": "Playwright is not installed, so browser automation is unavailable.",
        }
    if integration_id == "integ_ollama":
        return await _probe_ollama()
    if integration_id == "integ_gemini":
        return await _probe_bearer_models(
            integration_id,
            "https://generativelanguage.googleapis.com/v1beta/models",
            env_names=("GEMINI_API_KEY", "GOOGLE_API_KEY"),
            query_key=True,
        )
    if integration_id == "integ_groq":
        return await _probe_bearer_models(
            integration_id,
            "https://api.groq.com/openai/v1/models",
            env_names=("GROQ_API_KEY",),
        )
    if integration_id == "integ_openrouter":
        return await _probe_bearer_models(
            integration_id,
            "https://openrouter.ai/api/v1/models",
            env_names=("OPENROUTER_API_KEY",),
        )
    if integration_id == "integ_github":
        return await _probe_github()
    if integration_id == "integ_mcp_servers":
        try:
            import mcp  # noqa: F401
            sdk = "The MCP Python SDK is installed."
        except Exception:
            sdk = "The MCP Python SDK is not installed."
        return {
            "status": "not_configured",
            "latency_ms": None,
            "message": sdk + " No MCP server is approved, and discovered tools are not executed automatically.",
        }
    if integration_id in {"integ_gmail", "integ_gdrive", "integ_gcalendar"}:
        return {
            "status": "not_configured",
            "latency_ms": None,
            "message": "Google OAuth is not configured. This connector is not connected and was not called.",
        }
    return {"status": "not_configured", "latency_ms": None, "message": "No live probe is configured for this connector."}


async def _probe_ollama() -> dict[str, Any]:
    import os
    host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    parsed = urlsplit(host)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return {"status": "error", "code": "error", "latency_ms": None, "message": "OLLAMA_HOST is not a valid http(s) address."}
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            response = await client.get(f"{host}/api/tags")
        if response.status_code >= 400:
            return {"status": "error", "code": "error", "latency_ms": _elapsed(started), "message": f"Ollama returned HTTP {response.status_code}."}
        models = response.json().get("models") or []
        names = [item.get("name") for item in models if isinstance(item, dict) and item.get("name")]
        if not names:
            return {
                "status": "success",
                "code": "connected",
                "latency_ms": _elapsed(started),
                "message": "Connected: Ollama is running, but no models are installed. Run 'ollama pull llama3' or 'mistral'.",
                "models": [],
            }
        return {
            "status": "success",
            "code": "connected",
            "latency_ms": _elapsed(started),
            "message": f"Connected: Ollama is running with {len(names)} installed model(s): {', '.join(names[:4])}.",
            "models": names[:8],
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "code": "unreachable",
            "latency_ms": None,
            "message": "Ollama is not running. Start Ollama locally with 'ollama serve' to enable local models.",
        }


INTEGRATION_ENV_MAP: dict[str, tuple[str, ...]] = {
    "integ_gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "integ_groq": ("GROQ_API_KEY",),
    "integ_openrouter": ("OPENROUTER_API_KEY",),
    "integ_github": ("GITHUB_TOKEN",),
    "integ_slack": ("SLACK_API_KEY",),
}


def get_credential_metadata(integration_id: str) -> dict[str, Any]:
    import os
    stored = get_secret(integration_id)
    if stored:
        masked = f"{stored[:4]}••••{stored[-4:]}" if len(stored) > 8 else "••••••••"
        return {"has_credentials": True, "source": "vault", "masked": masked}
    env_keys = INTEGRATION_ENV_MAP.get(integration_id, ())
    for key in env_keys:
        val = os.getenv(key, "").strip()
        if val:
            masked = f"{val[:4]}••••{val[-4:]}" if len(val) > 8 else "••••••••"
            return {"has_credentials": True, "source": "env", "masked": masked}
    return {"has_credentials": False, "source": "none", "masked": None}


def _provider_key(integration_id: str, env_names: tuple[str, ...]) -> str | None:
    import os
    stored = get_secret(integration_id)
    if stored:
        return stored
    for name in env_names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


async def _probe_bearer_models(integration_id: str, url: str, env_names: tuple[str, ...], query_key: bool = False) -> dict[str, Any]:
    key = _provider_key(integration_id, env_names)
    if not key:
        return {
            "status": "not_configured",
            "code": "not_configured",
            "latency_ms": None,
            "message": "No API key is configured for this provider. Add a key in Integrations or set it in .env."
        }
    started = time.perf_counter()
    headers = {"User-Agent": "WhistleCode"}
    params = None
    if query_key:
        params = {"key": key}
    else:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code in {401, 403}:
            return {
                "status": "error",
                "code": "invalid_key",
                "latency_ms": _elapsed(started),
                "message": "Invalid key: The provider rejected the API key. Please check and re-enter your key."
            }
        if response.status_code == 429:
            return {
                "status": "error",
                "code": "rate_limited",
                "latency_ms": _elapsed(started),
                "message": "Rate limited: Provider quota exceeded or rate limit reached. Please check your account quota."
            }
        if response.status_code == 404:
            return {
                "status": "error",
                "code": "model_not_found",
                "latency_ms": _elapsed(started),
                "message": "Model not found: The configured model or endpoint could not be resolved."
            }
        if response.status_code >= 400:
            return {
                "status": "error",
                "code": "error",
                "latency_ms": _elapsed(started),
                "message": f"Provider error: Returned HTTP {response.status_code}."
            }
        return {
            "status": "success",
            "code": "connected",
            "latency_ms": _elapsed(started),
            "message": "Connected: Provider accepted the key and returned a valid model list."
        }
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return {
            "status": "unavailable",
            "code": "unreachable",
            "latency_ms": None,
            "message": f"Unreachable: Could not reach the provider endpoint ({exc.__class__.__name__})."
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "code": "unreachable",
            "latency_ms": None,
            "message": f"Connection failed: {redact_secrets(str(exc))}"
        }


async def _probe_github() -> dict[str, Any]:
    token = get_secret("integ_github")
    if not token:
        import os
        token = os.getenv("GITHUB_TOKEN", "").strip() or None
    if not token:
        return {
            "status": "not_configured",
            "code": "not_configured",
            "latency_ms": None,
            "message": "No GitHub token is configured. Add a token in Integrations or set GITHUB_TOKEN in .env."
        }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "WhistleCode",
                },
            )
        if response.status_code in {401, 403}:
            return {
                "status": "error",
                "code": "invalid_key",
                "latency_ms": _elapsed(started),
                "message": "Invalid key: GitHub rejected the personal access token. Please verify token permissions."
            }
        if response.status_code == 429:
            return {
                "status": "error",
                "code": "rate_limited",
                "latency_ms": _elapsed(started),
                "message": "Rate limited: GitHub API rate limit reached."
            }
        if response.status_code >= 400:
            return {
                "status": "error",
                "code": "error",
                "latency_ms": _elapsed(started),
                "message": f"GitHub returned HTTP {response.status_code}."
            }
        login = response.json().get("login") or "the authenticated user"
        raw_scopes = response.headers.get("x-oauth-scopes", "").strip()
        scopes = [s.strip() for s in raw_scopes.split(",") if s.strip()]
        scope_text = f" Scopes: {', '.join(scopes)}." if scopes else " No special scopes (public data only)."
        return {
            "status": "success",
            "code": "connected",
            "latency_ms": _elapsed(started),
            "message": f"Connected: GitHub authenticated as @{login}.{scope_text}",
            "scopes": scopes,
            "login": login,
        }
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return {
            "status": "unavailable",
            "code": "unreachable",
            "latency_ms": None,
            "message": f"Unreachable: Could not reach GitHub API ({exc.__class__.__name__})."
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "code": "unreachable",
            "latency_ms": None,
            "message": redact_secrets(str(exc))
        }


def local_availability(integration_id: str) -> tuple[str, str]:
    if integration_id == "integ_local_desktop":
        return "ready", f"Sandbox folder: {sandbox_root()}"
    if integration_id == "integ_browser":
        if playwright_available():
            return "runtime_present", "Playwright can be imported. No browser account is connected."
        return "missing_runtime", "Playwright is not installed."
    if integration_id == "integ_ollama":
        return "local_service", "Status is confirmed only by a live request to Ollama."
    if integration_id == "integ_mcp_servers":
        return "untrusted", "MCP servers stay disabled until each tool is approved."
    meta = get_credential_metadata(integration_id)
    if meta["has_credentials"]:
        if meta["source"] == "vault":
            return "credential_stored", "Stored in server-side vault (overrides .env). Run Test to verify."
        return "env_configured", "Inherited from .env variable. Run Test to verify."
    return "not_configured", "No credential is stored, so this connector is not connected."
