from __future__ import annotations
import json
import sqlite3
import datetime
from typing import List, Optional, Dict, Any
from app.credentials.store import CredentialStoreError, delete_secret, has_secret, put_secret
from app.db.database import get_db
from app.integrations.probes import local_availability, playwright_available, probe_integration
from app.models.integration import IntegrationDefinition, IntegrationStatus, IntegrationToolSchema
from app.tools.filesystem import sandbox_root


INITIAL_INTEGRATIONS = [
    {
        "id": "integ_browser",
        "name": "Browser Automation",
        "description": "Headless and live Chromium browser session control via Playwright for web scraping and portal interaction.",
        "category": "browser",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Globe",
        "is_mcp": False,
        "endpoint_or_server": "local://playwright",
        "available_tools": [
            {"name": "navigate_url", "description": "Navigates browser to destination URL", "required_permissions": ["browser_control"]},
            {"name": "click_element", "description": "Clicks on element matching selector or text", "required_permissions": ["browser_control"]},
            {"name": "extract_dom_text", "description": "Reads text and table content from web page", "required_permissions": ["browser_control"]},
            {"name": "capture_screenshot", "description": "Takes a visual screenshot of current viewport", "required_permissions": ["browser_control"]}
        ],
        "required_permissions": ["browser_control", "network_access"],
        "has_credentials": False,
        "config_schema": {"headless": "boolean", "timeout_ms": "number"}
    },
    {
        "id": "integ_gmail",
        "name": "Gmail",
        "description": "Connects to Google Workspace to read, triage, draft, and archive incoming correspondence.",
        "category": "google_workspace",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Mail",
        "is_mcp": False,
        "endpoint_or_server": "https://gmail.googleapis.com",
        "available_tools": [
            {"name": "search_messages", "description": "Search inbox by sender, subject, date, or label", "required_permissions": ["read_email"]},
            {"name": "get_attachment", "description": "Download invoice and document attachments", "required_permissions": ["read_email", "write_file"]},
            {"name": "draft_reply", "description": "Prepares drafted response email for user review", "required_permissions": ["draft_email"]}
        ],
        "required_permissions": ["read_email", "draft_email"],
        "has_credentials": False,
        "config_schema": {"mailbox": "string", "sync_interval_mins": "number"}
    },
    {
        "id": "integ_local_desktop",
        "name": "Local Desktop & Filesystem",
        "description": "Controlled file reading, writing, and directory organization in approved workspace folders.",
        "category": "system",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Folder",
        "is_mcp": False,
        "endpoint_or_server": "local://filesystem",
        "available_tools": [
            {"name": "read_file", "description": "Reads file contents in safe workspace folder", "required_permissions": ["read_file"]},
            {"name": "write_file", "description": "Writes file contents or moves files", "required_permissions": ["write_file"]},
            {"name": "list_directory", "description": "Lists contents of approved workspace folder", "required_permissions": ["read_file"]}
        ],
        "required_permissions": ["read_file", "write_file"],
        "has_credentials": False,
        "config_schema": {"allowed_directories": "array"}
    },
    {
        "id": "integ_gdrive",
        "name": "Google Drive",
        "description": "Cloud document storage, folder synchronization, and collaborative spreadsheet access.",
        "category": "google_workspace",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "HardDrive",
        "is_mcp": False,
        "endpoint_or_server": "https://www.googleapis.com/drive/v3",
        "available_tools": [
            {"name": "upload_file", "description": "Uploads local file to target Drive folder", "required_permissions": ["write_drive"]},
            {"name": "search_files", "description": "Searches files and folders in Drive", "required_permissions": ["read_drive"]}
        ],
        "required_permissions": ["read_drive", "write_drive"],
        "has_credentials": False,
        "config_schema": {"root_folder_id": "string"}
    },
    {
        "id": "integ_gcalendar",
        "name": "Google Calendar",
        "description": "Meeting scheduling, conflict resolution, and calendar agenda summaries.",
        "category": "google_workspace",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Calendar",
        "is_mcp": False,
        "endpoint_or_server": "https://www.googleapis.com/calendar/v3",
        "available_tools": [
            {"name": "list_events", "description": "Retrieves upcoming calendar meetings", "required_permissions": ["read_calendar"]},
            {"name": "create_event", "description": "Schedules meeting invitation", "required_permissions": ["write_calendar"]}
        ],
        "required_permissions": ["read_calendar", "write_calendar"],
        "has_credentials": False,
        "config_schema": {"calendar_id": "string"}
    },
    {
        "id": "integ_github",
        "name": "GitHub",
        "description": "Issue tracking, PR reviews, workflow CI/CD status inspection, and repository comments.",
        "category": "developer",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Github",
        "is_mcp": False,
        "endpoint_or_server": "https://api.github.com",
        "available_tools": [
            {"name": "list_issues", "description": "Fetches repo issues by label or milestone", "required_permissions": ["read_github"]},
            {"name": "create_comment", "description": "Posts reply or label on GitHub issue", "required_permissions": ["write_github"]}
        ],
        "required_permissions": ["read_github", "write_github"],
        "has_credentials": False,
        "config_schema": {"repository": "string", "default_branch": "string"}
    },
    {
        "id": "integ_mcp_servers",
        "name": "MCP Server Connector",
        "description": "Model Context Protocol client for connecting any local or remote stdio/SSE MCP server tools.",
        "category": "mcp",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Layers",
        "is_mcp": True,
        "endpoint_or_server": "stdio://mcp_runner",
        "available_tools": [
            {"name": "mcp_list_tools", "description": "Dynamically discovers tools from registered MCP servers", "required_permissions": ["mcp_discovery"]},
            {"name": "mcp_call_tool", "description": "Executes MCP tool with typed JSON arguments", "required_permissions": ["mcp_execution"]}
        ],
        "required_permissions": ["mcp_discovery", "mcp_execution"],
        "has_credentials": False,
        "config_schema": {"servers": "array"}
    },
    {
        "id": "integ_gemini",
        "name": "Google Gemini",
        "description": "Primary model provider. Connects only after a stored API key is accepted by Google.",
        "category": "ai_provider",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Spark",
        "is_mcp": False,
        "endpoint_or_server": "https://generativelanguage.googleapis.com",
        "available_tools": [
            {"name": "generate_text", "description": "Sends a prompt to Gemini when a key is configured", "required_permissions": ["ai_generate"]}
        ],
        "required_permissions": ["ai_generate"],
        "has_credentials": False,
        "config_schema": {"api_key": "secret", "model": "string"}
    },
    {
        "id": "integ_groq",
        "name": "Groq",
        "description": "Optional fallback model provider. Stays disconnected until a Groq API key passes a live check.",
        "category": "ai_provider",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Zap",
        "is_mcp": False,
        "endpoint_or_server": "https://api.groq.com",
        "available_tools": [
            {"name": "generate_text", "description": "Sends a prompt to Groq when a key is configured", "required_permissions": ["ai_generate"]}
        ],
        "required_permissions": ["ai_generate"],
        "has_credentials": False,
        "config_schema": {"api_key": "secret", "model": "string"}
    },
    {
        "id": "integ_ollama",
        "name": "Ollama",
        "description": "Optional local model runtime. Status comes from a live request to the local Ollama service.",
        "category": "ai_provider",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Cpu",
        "is_mcp": False,
        "endpoint_or_server": "http://127.0.0.1:11434",
        "available_tools": [
            {"name": "generate_text", "description": "Sends a prompt to a local Ollama model", "required_permissions": ["ai_generate"]}
        ],
        "required_permissions": ["ai_generate"],
        "has_credentials": False,
        "config_schema": {"host": "string", "model": "string"}
    },
    {
        "id": "integ_openrouter",
        "name": "OpenRouter",
        "description": "Future provider slot. It is not connected until an OpenRouter key passes a live model-list check.",
        "category": "ai_provider",
        "status": IntegrationStatus.DISCONNECTED,
        "icon": "Route",
        "is_mcp": False,
        "endpoint_or_server": "https://openrouter.ai/api/v1",
        "available_tools": [
            {"name": "generate_text", "description": "Sends a prompt through OpenRouter when a key is configured", "required_permissions": ["ai_generate"]}
        ],
        "required_permissions": ["ai_generate"],
        "has_credentials": False,
        "config_schema": {"api_key": "secret", "model": "string"}
    }
]


SECRET_INTEGRATIONS = {"integ_gemini", "integ_groq", "integ_openrouter", "integ_github"}
EXTERNAL_UNREADY = {"integ_gmail", "integ_gdrive", "integ_gcalendar", "integ_mcp_servers"}


class IntegrationConfigError(Exception):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


class IntegrationHubService:
    @staticmethod
    def _row_to_integration(row: sqlite3.Row) -> IntegrationDefinition:
        tools = []
        if row["available_tools_json"]:
            try:
                raw_tools = json.loads(row["available_tools_json"])
                tools = [IntegrationToolSchema(**t) for t in raw_tools]
            except Exception:
                pass

        return IntegrationDefinition(
            id=row["id"],
            name=row["name"],
            description=row["description"] or "",
            category=row["category"],
            status=IntegrationStatus(row["status"]) if row["status"] in [s.value for s in IntegrationStatus] else IntegrationStatus.DISCONNECTED,
            icon=row["icon"],
            is_mcp=bool(row["is_mcp"]),
            endpoint_or_server=row["endpoint_or_server"],
            available_tools=tools,
            required_permissions=json.loads(row["required_permissions_json"]) if row["required_permissions_json"] else [],
            config_schema=json.loads(row["config_schema_json"]) if row["config_schema_json"] else {},
            has_credentials=bool(row["has_credentials"]),
            last_tested_at=row["last_tested_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    @classmethod
    def _insert_catalog_item(cls, cursor, item: dict, now: str) -> None:
        cursor.execute("""
            INSERT INTO integrations (
                id, name, description, category, status, icon, is_mcp,
                endpoint_or_server, available_tools_json, required_permissions_json,
                config_schema_json, has_credentials, last_tested_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"],
            item["name"],
            item["description"],
            item["category"],
            item["status"].value,
            item["icon"],
            1 if item["is_mcp"] else 0,
            item["endpoint_or_server"],
            json.dumps(item["available_tools"]),
            json.dumps(item["required_permissions"]),
            json.dumps(item["config_schema"]),
            1 if item["has_credentials"] else 0,
            None,
            now,
            now
        ))

    @classmethod
    def seed_default_integrations(cls):
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute("SELECT id FROM integrations")
        existing = {row["id"] for row in cursor.fetchall()}
        for item in INITIAL_INTEGRATIONS:
            if item["id"] not in existing:
                cls._insert_catalog_item(cursor, item, now)
        conn.commit()
        conn.close()
        cls.reconcile_false_connections()

    @classmethod
    def reconcile_false_connections(cls):
        """Clears catalog rows that were marked connected without a real credential or runtime."""
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for integration_id in SECRET_INTEGRATIONS | EXTERNAL_UNREADY:
            if has_secret(integration_id):
                continue
            cursor.execute("""
                UPDATE integrations
                SET status = 'disconnected', has_credentials = 0, updated_at = ?
                WHERE id = ? AND (status = 'connected' OR has_credentials = 1)
            """, (now, integration_id))
        cursor.execute("""
            UPDATE integrations
            SET has_credentials = 0, updated_at = ?
            WHERE id IN ('integ_browser', 'integ_local_desktop', 'integ_ollama') AND has_credentials = 1
        """, (now,))
        if not playwright_available():
            cursor.execute("""
                UPDATE integrations
                SET status = 'disconnected', updated_at = ?
                WHERE id = 'integ_browser' AND status = 'connected'
            """, (now,))
        conn.commit()
        conn.close()

    @classmethod
    def _annotate(cls, integration: IntegrationDefinition) -> IntegrationDefinition:
        availability, detail = local_availability(integration.id)
        integration.availability = availability
        integration.status_detail = detail
        integration.has_credentials = has_secret(integration.id)
        if integration.id in EXTERNAL_UNREADY and integration.status == IntegrationStatus.CONNECTED:
            integration.status = IntegrationStatus.DISCONNECTED
        return integration

    @classmethod
    def list_integrations(cls) -> List[IntegrationDefinition]:
        cls.seed_default_integrations()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM integrations ORDER BY id ASC")
        rows = cursor.fetchall()
        integrations = [cls._annotate(cls._row_to_integration(r)) for r in rows]
        conn.close()
        return integrations

    @classmethod
    def get_integration(cls, integ_id: str) -> Optional[IntegrationDefinition]:
        cls.seed_default_integrations()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM integrations WHERE id = ?", (integ_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return cls._annotate(cls._row_to_integration(row))

    @classmethod
    def connect_integration(cls, integ_id: str, config: Optional[Dict[str, Any]] = None) -> Optional[IntegrationDefinition]:
        current = cls.get_integration(integ_id)
        if not current:
            return None
        config = config or {}
        if integ_id in EXTERNAL_UNREADY:
            raise IntegrationConfigError(
                f"{current.name} is not connected. OAuth or an approved MCP server is not configured, so no external call was made."
            )
        if integ_id == "integ_local_desktop":
            sandbox_root()
            cls._set_status(integ_id, IntegrationStatus.CONNECTED, has_credentials=False)
            return cls.get_integration(integ_id)
        if integ_id == "integ_browser":
            if not playwright_available():
                raise IntegrationConfigError("Playwright is not installed, so browser automation cannot be enabled.", 503)
            cls._set_status(integ_id, IntegrationStatus.CONNECTED, has_credentials=False)
            return cls.get_integration(integ_id)
        if integ_id == "integ_ollama":
            cls._set_status(integ_id, IntegrationStatus.CONFIGURING, has_credentials=False)
            return cls.get_integration(integ_id)
        if integ_id in SECRET_INTEGRATIONS:
            api_key = str(config.get("api_key") or config.get("token") or "").strip()
            if api_key:
                try:
                    put_secret(integ_id, api_key)
                except CredentialStoreError as exc:
                    raise IntegrationConfigError(str(exc), 422) from exc
            elif not has_secret(integ_id):
                raise IntegrationConfigError(f"{current.name} needs an API token before it can be connected.")
            cls._set_status(integ_id, IntegrationStatus.CONFIGURING, has_credentials=True)
            return cls.get_integration(integ_id)
        raise IntegrationConfigError(f"{current.name} cannot be marked connected without a live check.")

    @classmethod
    def disconnect_integration(cls, integ_id: str) -> Optional[IntegrationDefinition]:
        delete_secret(integ_id)
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute("""
            UPDATE integrations
            SET status = 'disconnected', has_credentials = 0, updated_at = ?
            WHERE id = ?
        """, (now, integ_id))
        conn.commit()
        conn.close()
        return cls.get_integration(integ_id)

    @classmethod
    def _set_status(cls, integ_id: str, status: IntegrationStatus, has_credentials: bool, tested_at: Optional[str] = None) -> None:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute("""
            UPDATE integrations
            SET status = ?, has_credentials = ?, last_tested_at = COALESCE(?, last_tested_at), updated_at = ?
            WHERE id = ?
        """, (status.value, 1 if has_credentials else 0, tested_at, now, integ_id))
        conn.commit()
        conn.close()

    @classmethod
    async def test_connection(cls, integ_id: str) -> Dict[str, Any]:
        integ = cls.get_integration(integ_id)
        if not integ:
            return {"status": "error", "code": "not_found", "message": f"Integration {integ_id} not found."}
        result = await probe_integration(integ_id)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        status_value = result.get("status")
        if status_value == "success":
            next_status = IntegrationStatus.CONNECTED
        elif status_value == "error":
            next_status = IntegrationStatus.ERROR
        else:
            next_status = IntegrationStatus.DISCONNECTED
        cls._set_status(integ_id, next_status, has_secret(integ_id), tested_at=now)
        return {
            "status": status_value,
            "integration_id": integ_id,
            "name": integ.name,
            "latency_ms": result.get("latency_ms"),
            "message": result.get("message"),
            "endpoint": result.get("endpoint") or integ.endpoint_or_server,
            "tools_count": len(integ.available_tools),
            "tested_at": now,
        }
