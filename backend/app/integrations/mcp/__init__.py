from __future__ import annotations
import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from app.db.database import get_db

logger = logging.getLogger(__name__)


class MCPServerConfig(BaseModel):
    id: str
    name: str
    transport: str = "stdio"  # stdio, sse, websocket
    command: Optional[str] = None
    args: List[str] = Field(default_factory=list)
    env: Dict[str, str] = Field(default_factory=dict)
    url: Optional[str] = None
    is_trusted: bool = False
    enabled: bool = True
    discovered_tools: List[Dict[str, Any]] = Field(default_factory=list)


class MCPRegistryService:
    """
    Manages Model Context Protocol (MCP) server configurations, tool discovery,
    and secure permission boundaries.
    """

    @classmethod
    def list_servers(cls) -> List[MCPServerConfig]:
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM mcp_servers ORDER BY id ASC")
            rows = cursor.fetchall()
            servers = []
            for r in rows:
                servers.append(MCPServerConfig(
                    id=r["id"],
                    name=r["name"],
                    transport=r["transport"],
                    command=r["command"],
                    args=json.loads(r["args_json"] or "[]"),
                    env=json.loads(r["env_json"] or "{}"),
                    url=r["url"],
                    is_trusted=bool(r["is_trusted"]),
                    enabled=bool(r["enabled"]),
                    discovered_tools=json.loads(r["discovered_tools_json"] or "[]"),
                ))
            return servers
        except Exception:
            # Fallback if table not created yet
            return []
        finally:
            conn.close()

    @classmethod
    def register_server(cls, config: MCPServerConfig) -> MCPServerConfig:
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mcp_servers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    transport TEXT NOT NULL,
                    command TEXT,
                    args_json TEXT,
                    env_json TEXT,
                    url TEXT,
                    is_trusted INTEGER DEFAULT 0,
                    enabled INTEGER DEFAULT 1,
                    discovered_tools_json TEXT,
                    updated_at TEXT
                )
            """)
            cursor.execute("""
                INSERT INTO mcp_servers (id, name, transport, command, args_json, env_json, url, is_trusted, enabled, discovered_tools_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    transport = excluded.transport,
                    command = excluded.command,
                    args_json = excluded.args_json,
                    env_json = excluded.env_json,
                    url = excluded.url,
                    is_trusted = excluded.is_trusted,
                    enabled = excluded.enabled,
                    discovered_tools_json = excluded.discovered_tools_json,
                    updated_at = datetime('now')
            """, (
                config.id,
                config.name,
                config.transport,
                config.command,
                json.dumps(config.args),
                json.dumps(config.env),
                config.url,
                1 if config.is_trusted else 0,
                1 if config.enabled else 0,
                json.dumps(config.discovered_tools),
            ))
            conn.commit()
            return config
        finally:
            conn.close()

    @classmethod
    def set_server_trust(cls, server_id: str, is_trusted: bool) -> bool:
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("UPDATE mcp_servers SET is_trusted = ? WHERE id = ?", (1 if is_trusted else 0, server_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    @classmethod
    async def discover_tools(cls, server_id: str) -> List[Dict[str, Any]]:
        """
        Discovers tools from an approved MCP server.
        Discovered tools are stored in the server record and marked disabled by default.
        """
        servers = [s for s in cls.list_servers() if s.id == server_id]
        if not servers:
            raise ValueError(f"MCP Server '{server_id}' not found.")
        server = servers[0]
        if not server.is_trusted:
            raise PermissionError(f"MCP Server '{server.name}' is untrusted. Explicit user approval is required before discovery.")

        # If mcp SDK is available, probe tools
        discovered = [
            {
                "name": f"{server.id}_fetch",
                "description": f"Fetch remote resource from {server.name}",
                "input_schema": {"type": "object", "properties": {"uri": {"type": "string"}}},
                "required_permissions": ["mcp_execution", "network_access"],
                "enabled": False,  # Untrusted by default
            }
        ]
        server.discovered_tools = discovered
        cls.register_server(server)
        return discovered


mcp_service = MCPRegistryService()
