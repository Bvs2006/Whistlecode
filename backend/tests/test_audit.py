import pytest
from backend.app.audit.logger import AuditLogger


def test_audit_hash_chaining_and_tamper_detection():
    """AUD-3: Audit log is append-only with hash chaining."""
    e1 = AuditLogger.log_event(actor="user", event_type="TEST_1", details={"note": "first"})
    e2 = AuditLogger.log_event(actor="executor", event_type="TEST_2", details={"note": "second"})

    assert e2.prev_hash == e1.entry_hash

    is_valid, failing_id = AuditLogger.verify_chain()
    assert is_valid is True
    assert failing_id is None


def test_secret_scrubbing_in_audit_logs():
    """AUD-2: Logs never contain secrets or masked values."""
    entry = AuditLogger.log_event(
        actor="recorder",
        event_type="INPUT_CAPTURED",
        details={"user_password": "supersecretpassword123", "normal_field": "hello"}
    )
    assert entry.details["user_password"] == "[REDACTED_SECRET]"
    assert entry.details["normal_field"] == "hello"
