import pytest
from pathlib import Path
from backend.app.db import database

@pytest.fixture(autouse=True)
def setup_test_db(monkeypatch):
    """Keep test data out of the application's local database."""
    backend_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setattr(database, "DB_PATH", backend_dir / "whistlecode-test.db")
    database.init_db()
    conn = database.get_db_connection()
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        tables = [row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )]
        for table in tables:
            conn.execute(f'DELETE FROM "{table}"')
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'").fetchone():
            conn.execute("DELETE FROM sqlite_sequence")
        conn.commit()
    finally:
        conn.close()
