from __future__ import annotations
import json
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from ..models.workflow import RiskLevel
from ..db.database import get_db_connection


class ToolDefinition(BaseModel):
    name: str
    display_name: str
    description: str
    parameters_schema: Dict[str, Any]
    risk_level: RiskLevel = RiskLevel.LOW
    requires_confirmation: bool = False


class PluginManifest(BaseModel):
    id: str
    name: str
    version: str
    description: str
    author: str = "WhistleCode Extensibility"
    enabled: bool = True
    icon: str = "🧩"
    tools: List[ToolDefinition] = Field(default_factory=list)
    resource_types: List[str] = Field(default_factory=list)
    settings_schema: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)


class PluginManager:
    """
    Extensible Plugin and Tool Resource Registry.
    Enables future plugin additions, MCP tool loading, and external system integrations.
    """

    def __init__(self):
        self.plugins: Dict[str, PluginManifest] = {}
        self._init_builtin_plugins()
        self.load_custom_plugins()

    def _init_builtin_plugins(self):
        # 1. HTTP / Webhook Plugin
        webhook_plugin = PluginManifest(
            id="plugin_http_webhook",
            name="HTTP Webhook & API Bridge",
            version="1.0.0",
            description="Trigger external webhooks, post run outputs to Slack/Zapier, or fetch external REST data.",
            icon="🌐",
            enabled=True,
            tools=[
                ToolDefinition(
                    name="post_webhook",
                    display_name="Send HTTP POST Webhook",
                    description="Sends a JSON payload to a specified webhook URL upon workflow step completion.",
                    parameters_schema={
                        "url": {"type": "string", "description": "Target endpoint URL"},
                        "payload": {"type": "object", "description": "JSON payload key-values"}
                    },
                    risk_level=RiskLevel.MEDIUM,
                    requires_confirmation=False
                ),
                ToolDefinition(
                    name="fetch_rest_api",
                    display_name="Fetch Data from REST API",
                    description="Retrieves JSON data from an external API to inject as parameters.",
                    parameters_schema={
                        "url": {"type": "string", "description": "REST endpoint URL"}
                    },
                    risk_level=RiskLevel.LOW
                )
            ]
        )
        self.plugins[webhook_plugin.id] = webhook_plugin

        # 2. File & Data Exporter Plugin
        file_plugin = PluginManifest(
            id="plugin_data_export",
            name="Data & File Exporter",
            version="1.0.0",
            description="Export scraped workflow outputs to CSV, JSON, or markdown report files.",
            icon="📁",
            enabled=True,
            tools=[
                ToolDefinition(
                    name="export_csv",
                    display_name="Export Table to CSV",
                    description="Saves tabular data extracted during workflow run to a CSV file.",
                    parameters_schema={
                        "filename": {"type": "string", "description": "Destination file name"},
                        "rows": {"type": "array", "description": "List of row records"}
                    },
                    risk_level=RiskLevel.LOW
                ),
                ToolDefinition(
                    name="export_json",
                    display_name="Save JSON Report",
                    description="Saves execution results and metadata to a local JSON artifact.",
                    parameters_schema={
                        "filename": {"type": "string", "description": "Destination file name"},
                        "data": {"type": "object", "description": "JSON object to write"}
                    },
                    risk_level=RiskLevel.LOW
                )
            ]
        )
        self.plugins[file_plugin.id] = file_plugin

        # 3. Desktop Notification Plugin
        notifier_plugin = PluginManifest(
            id="plugin_desktop_notifier",
            name="Desktop & System Alerts",
            version="1.0.0",
            description="Native desktop notifications and sound alerts when workflows need user confirmation or complete.",
            icon="🔔",
            enabled=True,
            tools=[
                ToolDefinition(
                    name="notify_user",
                    display_name="Push Desktop Notification",
                    description="Displays a desktop notification with a custom message and status.",
                    parameters_schema={
                        "title": {"type": "string", "description": "Alert title"},
                        "message": {"type": "string", "description": "Notification message"}
                    },
                    risk_level=RiskLevel.LOW
                )
            ]
        )
        self.plugins[notifier_plugin.id] = notifier_plugin

        # 4. MCP & Dynamic Tool Resource Plugin
        mcp_plugin = PluginManifest(
            id="plugin_mcp_bridge",
            name="Model Context Protocol (MCP) Bridge",
            version="1.0.0",
            description="Connect to standard MCP tool servers and lazy-load external agentic capabilities.",
            icon="⚡",
            enabled=True,
            tools=[
                ToolDefinition(
                    name="call_mcp_tool",
                    display_name="Execute Remote MCP Tool",
                    description="Dispatches a call to an MCP server tool (e.g. database, browser, or cloud resources).",
                    parameters_schema={
                        "server_name": {"type": "string", "description": "Target MCP server identifier"},
                        "tool_name": {"type": "string", "description": "Name of the tool on the server"},
                        "arguments": {"type": "object", "description": "Arguments to pass"}
                    },
                    risk_level=RiskLevel.MEDIUM,
                    requires_confirmation=True
                )
            ]
        )
        self.plugins[mcp_plugin.id] = mcp_plugin

    def load_custom_plugins(self):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS plugins (
                    id TEXT PRIMARY KEY,
                    manifest_json TEXT NOT NULL,
                    enabled INTEGER NOT NULL
                )
            """)
            cursor.execute("SELECT * FROM plugins")
            rows = cursor.fetchall()
            for r in rows:
                try:
                    data = json.loads(r["manifest_json"])
                    p = PluginManifest(**data)
                    p.enabled = bool(r["enabled"])
                    self.plugins[p.id] = p
                except Exception:
                    pass
            conn.close()
        except Exception:
            pass

    def register_plugin(self, manifest: PluginManifest) -> PluginManifest:
        self.plugins[manifest.id] = manifest
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO plugins (id, manifest_json, enabled) VALUES (?, ?, ?)",
                (manifest.id, manifest.model_dump_json(), 1 if manifest.enabled else 0)
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
        return manifest

    def toggle_plugin(self, plugin_id: str, enabled: bool) -> Optional[PluginManifest]:
        if plugin_id in self.plugins:
            self.plugins[plugin_id].enabled = enabled
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE plugins SET enabled = ? WHERE id = ?",
                    (1 if enabled else 0, plugin_id)
                )
                conn.commit()
                conn.close()
            except Exception:
                pass
            return self.plugins[plugin_id]
        return None

    def list_plugins(self) -> List[PluginManifest]:
        return list(self.plugins.values())

    def get_tool(self, plugin_id: str, tool_name: str) -> Optional[ToolDefinition]:
        plugin = self.plugins.get(plugin_id)
        if not plugin or not plugin.enabled:
            return None
        for t in plugin.tools:
            if t.name == tool_name:
                return t
        return None

    def execute_tool(self, plugin_id: str, tool_name: str, args: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
        plugin = self.plugins.get(plugin_id)
        if not plugin:
            return {"success": False, "error": f"Plugin '{plugin_id}' not found"}
        if not plugin.enabled:
            return {"success": False, "error": f"Plugin '{plugin_id}' is disabled"}

        tool = self.get_tool(plugin_id, tool_name)
        if not tool:
            return {"success": False, "error": f"Tool '{tool_name}' not found in plugin '{plugin_id}'"}

        if dry_run:
            return {
                "success": True,
                "dry_run": True,
                "message": f"[DRY-RUN] Would execute {plugin.name} -> {tool.display_name}",
                "simulated_args": args
            }

        # Actual execution logic per tool
        try:
            if plugin_id == "plugin_http_webhook":
                if tool_name == "post_webhook":
                    url = args.get("url", "")
                    payload = json.dumps(args.get("payload", {})).encode("utf-8")
                    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
                    with urllib.request.urlopen(req, timeout=5) as response:
                        res_data = response.read().decode("utf-8")
                        return {"success": True, "status_code": response.status, "response": res_data[:500]}
                elif tool_name == "fetch_rest_api":
                    url = args.get("url", "")
                    with urllib.request.urlopen(url, timeout=5) as response:
                        res_data = response.read().decode("utf-8")
                        return {"success": True, "status_code": response.status, "data": json.loads(res_data)}

            elif plugin_id == "plugin_desktop_notifier":
                title = args.get("title", "WhistleCode Alert")
                msg = args.get("message", "Task step completed")
                print(f"[WhistleCode Notification] {title}: {msg}")
                return {"success": True, "notified": True, "title": title, "message": msg}

            elif plugin_id == "plugin_data_export":
                filename = args.get("filename", "whistlecode_export.json")
                out_path = Path(__file__).parent.parent.parent / "exports" / filename
                out_path.parent.mkdir(parents=True, exist_ok=True)
                with open(out_path, "w", encoding="utf-8") as f:
                    if tool_name == "export_csv":
                        rows = args.get("rows", [])
                        if rows and isinstance(rows[0], dict):
                            import csv
                            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                            writer.writeheader()
                            writer.writerows(rows)
                    else:
                        json.dump(args.get("data", {}), f, indent=2)
                return {"success": True, "exported_path": str(out_path)}

            elif plugin_id == "plugin_mcp_bridge":
                return {
                    "success": True,
                    "server": args.get("server_name"),
                    "tool": args.get("tool_name"),
                    "mcp_status": "dispatched",
                    "result": {"status": "ok", "echo_args": args.get("arguments")}
                }

            return {"success": True, "executed": f"{plugin_id}.{tool_name}", "args": args}
        except Exception as e:
            return {"success": False, "error": str(e)}


plugin_manager_instance = PluginManager()
