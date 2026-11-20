import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

DB_PATH = Path(__file__).parent.parent.parent / "whistlecode.db"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.execute("PRAGMA busy_timeout = 15000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.row_factory = sqlite3.Row
    return conn


get_db = get_db_connection


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        task_description TEXT,
        status TEXT NOT NULL,
        target_url TEXT,
        retention_until TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        recording_id TEXT NOT NULL,
        ts REAL NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        target_json TEXT,
        value_masked TEXT,
        metadata_json TEXT,
        FOREIGN KEY (recording_id) REFERENCES recordings (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        intent TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_versions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        json_data TEXT NOT NULL,
        parent_version INTEGER,
        change_summary TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES workflows (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        version_hash TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        approver TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        signature TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        version_hash TEXT NOT NULL,
        approval_id TEXT,
        policy_version TEXT NOT NULL,
        params_json TEXT NOT NULL,
        mode TEXT NOT NULL,
        state TEXT NOT NULL,
        verification_state TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        safe_stop_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        action TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        passed INTEGER NOT NULL,
        observed_state_json TEXT,
        error_message TEXT,
        ts REAL NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        actor TEXT NOT NULL,
        event_type TEXT NOT NULL,
        workflow_id TEXT,
        version_hash TEXT,
        ref_ids_json TEXT,
        details_json TEXT,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugin_tool_grants (
        approval_id TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sandbox_plan_grants (
        grant_id TEXT PRIMARY KEY,
        plan_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        instructions TEXT,
        model TEXT,
        assigned_skills_json TEXT,
        connected_integrations_json TEXT,
        memory_config_json TEXT,
        trigger_config_json TEXT,
        permission_scope_json TEXT,
        execution_policy_json TEXT,
        workflow_plan_json TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        input_schema_json TEXT,
        output_schema_json TEXT,
        workflow_definition_json TEXT,
        required_tools_json TEXT,
        permission_requirements_json TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        is_trusted INTEGER NOT NULL DEFAULT 0,
        validation_status TEXT NOT NULL DEFAULT 'validated',
        execution_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        provenance TEXT NOT NULL DEFAULT 'user_entry',
        confidence REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        icon TEXT NOT NULL,
        is_mcp INTEGER NOT NULL DEFAULT 0,
        endpoint_or_server TEXT,
        available_tools_json TEXT,
        required_permissions_json TEXT,
        config_schema_json TEXT,
        has_credentials INTEGER NOT NULL DEFAULT 0,
        last_tested_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_oauth_states (
        state TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        agent_id TEXT,
        trigger_type TEXT NOT NULL,
        schedule_cron TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        event_filter_json TEXT,
        retry_count INTEGER NOT NULL DEFAULT 3,
        retry_delay_seconds INTEGER NOT NULL DEFAULT 60,
        duplicate_protection_window_seconds INTEGER NOT NULL DEFAULT 300,
        status TEXT NOT NULL,
        required_permissions_json TEXT,
        last_triggered_at TEXT,
        next_run_at TEXT,
        execution_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_credentials (
        integration_id TEXT PRIMARY KEY,
        storage TEXT NOT NULL,
        secret TEXT,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
