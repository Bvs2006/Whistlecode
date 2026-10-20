import pytest
from backend.app.models.workflow import Postcondition
from backend.app.models.run import VerificationState
from backend.app.verifier.engine import VerifierEngine


def test_verifier_verified_success():
    """VER-1: All postconditions passing produces VERIFIED_SUCCESS."""
    postconditions = [
        Postcondition(type="url_matches", value="/tickets"),
        Postcondition(type="list_contains", selector="#ticket-list", value="Server issue")
    ]
    observed_state = {
        "current_url": "http://localhost:8000/tickets",
        "page_text": "Ticket list: Server issue resolved",
        "list_contents": {"#ticket-list": ["Server issue", "Onboarding"]}
    }

    state, details = VerifierEngine.verify_all(postconditions, observed_state)
    assert state == VerificationState.VERIFIED_SUCCESS
    assert all(d["passed"] for d in details)


def test_verifier_failed_on_mismatch():
    """VER-4: On failure, report failing step and expected state."""
    postconditions = [
        Postcondition(type="url_matches", value="/tickets/success")
    ]
    observed_state = {
        "current_url": "http://localhost:8000/tickets/error"
    }

    state, details = VerifierEngine.verify_all(postconditions, observed_state)
    assert state == VerificationState.FAILED
    assert details[0]["passed"] is False


def test_verifier_uncertain_when_no_postconditions():
    """VER-2: Uncertain state when success cannot be verified."""
    state, details = VerifierEngine.verify_all([], {})
    assert state == VerificationState.UNCERTAIN
