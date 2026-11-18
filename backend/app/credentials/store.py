from __future__ import annotations

import datetime

from app.db.database import get_db

KEYRING_SERVICE = "WhistleCode"
MAX_SECRET_LENGTH = 4096


class CredentialStoreError(Exception):
    pass


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def has_secret(integration_id: str) -> bool:
    return get_secret(integration_id) is not None


def get_secret(integration_id: str) -> str | None:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT storage, secret FROM integration_credentials WHERE integration_id = ?",
            (integration_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    if row["storage"] == "keyring":
        try:
            import keyring
            value = keyring.get_password(KEYRING_SERVICE, integration_id)
        except Exception:
            return None
        return value or None
    secret = row["secret"]
    return secret or None


def put_secret(integration_id: str, secret: str) -> str:
    cleaned = (secret or "").strip()
    if not cleaned:
        raise CredentialStoreError("A credential is required.")
    if len(cleaned) > MAX_SECRET_LENGTH:
        raise CredentialStoreError("Credential is too long.")
    storage = "sqlite"
    stored_value: str | None = cleaned
    try:
        import keyring
        keyring.set_password(KEYRING_SERVICE, integration_id, cleaned)
        storage = "keyring"
        stored_value = None
    except Exception:
        storage = "sqlite"
        stored_value = cleaned
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO integration_credentials (integration_id, storage, secret, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(integration_id) DO UPDATE SET
                storage = excluded.storage,
                secret = excluded.secret,
                updated_at = excluded.updated_at
            """,
            (integration_id, storage, stored_value, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    return storage


def delete_secret(integration_id: str) -> None:
    existing = get_secret(integration_id)
    conn = get_db()
    try:
        conn.execute("DELETE FROM integration_credentials WHERE integration_id = ?", (integration_id,))
        conn.commit()
    finally:
        conn.close()
    if existing:
        try:
            import keyring
            keyring.delete_password(KEYRING_SERVICE, integration_id)
        except Exception:
            pass
