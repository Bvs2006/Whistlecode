import pytest
from backend.app.recording.desktop_observer import (
    DesktopObserver,
    ObserverState,
    StateTransitionError,
    PermissionDeniedError,
)


def test_observer_state_transitions():
    obs = DesktopObserver()
    assert obs.get_state() == "idle"

    # Start recording
    session = obs.start_observation("Test Task", "Fill customer form", "http://localhost:8000/testsite")
    assert obs.get_state() == "recording"
    assert session.status == "active"

    # Pause
    state = obs.pause_observation()
    assert state == "paused"
    assert obs.get_state() == "paused"

    # Resume
    state = obs.resume_observation()
    assert state == "recording"
    assert obs.get_state() == "recording"

    # Stop
    sess = obs.stop_observation()
    assert obs.get_state() == "stopped"
    assert sess.status == "stopped"


def test_invalid_state_transitions_raise_error():
    obs = DesktopObserver()
    assert obs.get_state() == "idle"

    # Cannot pause when idle
    with pytest.raises(StateTransitionError):
        obs.pause_observation()

    # Cannot stop when idle
    with pytest.raises(StateTransitionError):
        obs.stop_observation()

    # Start then pause
    obs.start_observation("Task", "Outcome")
    obs.pause_observation()

    # Cannot pause when already paused
    with pytest.raises(StateTransitionError):
        obs.pause_observation()

    # Cannot resume when already recording
    obs.resume_observation()
    with pytest.raises(StateTransitionError):
        obs.resume_observation()


def test_discard_session():
    obs = DesktopObserver()
    obs.start_observation("Discardable Task", "Outcome")
    obs.capture_action("click", "Button 1")
    assert len(obs.original_events) == 1

    obs.discard_session()
    assert obs.get_state() == "discarded"
    assert obs.active_session is None
    assert len(obs.original_events) == 0


def test_duplicate_event_suppression():
    obs = DesktopObserver()
    obs.start_observation("Task", "Outcome")

    # Capture event 1
    evt1 = obs.capture_action("click", "Submit Button")
    assert evt1 is not None

    # Immediate duplicate click on same button is suppressed
    evt2 = obs.capture_action("click", "Submit Button")
    assert evt2 is None
    assert len(obs.active_session.events) == 1


def test_permission_denial():
    obs = DesktopObserver()
    obs.permissions["capture_clicks"] = False
    obs.start_observation("Task", "Outcome")

    with pytest.raises(PermissionDeniedError):
        obs.capture_action("click", "Menu Link")


def test_secret_redaction_and_privacy_boundaries():
    obs = DesktopObserver()
    obs.start_observation("Login Task", "Authenticate user")

    # Normal field
    e1 = obs.capture_action("type", "Customer Name", value="Jane Doe")
    assert e1.value == "Jane Doe"
    assert not e1.is_masked

    # Password field — MUST be automatically redacted
    e2 = obs.capture_action("type", "User Password", value="SuperSecretP@ss123")
    assert e2.value == "[REDACTED_SECRET]"
    assert e2.is_masked is True

    # Privacy review reports redactions
    priv = obs.get_privacy_review()
    assert priv["redacted_events_count"] == 1
    assert "passwords" in priv["strictly_excluded_and_never_collected"]


def test_observation_review_deletion_and_preservation():
    obs = DesktopObserver()
    obs.start_observation("Task", "Outcome")

    e1 = obs.capture_action("click", "Step 1")
    e2 = obs.capture_action("click", "Step 2")
    e3 = obs.capture_action("click", "Step 3")

    # Remove event 2
    deleted = obs.remove_event(e2.id)
    assert deleted is True

    # Edited list has 2 events, but original log preserves all 3
    assert len(obs.edited_events) == 2
    assert len(obs.original_events) == 3
    assert [e.id for e in obs.edited_events] == [e1.id, e3.id]


def test_observation_review_invalid_edits():
    obs = DesktopObserver()
    obs.start_observation("Task", "Outcome")
    e1 = obs.capture_action("click", "Button")

    # Empty target name must be rejected
    with pytest.raises(ValueError):
        obs.edit_event_description(e1.id, "   ")


def test_sanitization_for_ai_model_submission():
    obs = DesktopObserver()
    obs.start_observation("Task", "Outcome")
    obs.capture_action("click", "Login Button")
    obs.capture_action("type", "API Secret Token", value="xyz123")

    sanitized = obs.sanitize_for_model()
    assert len(sanitized) == 2
    assert sanitized[0]["target"] == "Login Button"
    assert sanitized[1]["value"] == "[REDACTED_SECRET]"
    assert sanitized[1]["is_ambiguous"] is False
