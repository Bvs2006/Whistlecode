import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

DB_PATH = Path(__file__).parent.parent.parent / "whistlecode.db"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


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
    """)

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
