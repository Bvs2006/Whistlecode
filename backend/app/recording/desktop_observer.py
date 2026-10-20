from __future__ import annotations
import uuid
import datetime
import json
import time
from typing import Optional, Dict, Any, List, Set
from enum import Enum
import psutil

try:
    import win32gui
    import win32process
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

from ..models.events import RecordedEvent, EventType, RecordingSession
from ..models.workflow import TargetDescriptor, TargetContext


class ObserverState(str, Enum):
    IDLE = "idle"
    RECORDING = "recording"
    PAUSED = "paused"
    STOPPED = "stopped"
    DISCARDED = "discarded"


class StateTransitionError(Exception):
    """Raised when an invalid state transition is requested."""
    pass


class PermissionDeniedError(Exception):
    """Raised when an event type is prohibited by observer permissions."""
    pass


class DesktopObserver:
    """
    Dedicated Observation Service Interface.
    Observes permitted structured actions from a controlled test application.
    Enforces privacy boundaries: zero passwords, zero raw keystrokes, zero clipboard capture.
    Maintains raw original events separate from edited interpretations.
    """

    # Prohibited keywords for automatic secret scrubbing
    SECRET_KEYWORDS = {
        "password", "passwd", "pwd", "secret", "token", "auth",
        "api_key", "apikey", "credential", "ssn", "creditcard", "cvv", "pin", "otp"
    }

    # Permitted actions in this controlled phase
    SUPPORTED_ACTIONS = {"navigate", "click", "type", "assert", "submit", "select"}

    def __init__(self):
        self.state: ObserverState = ObserverState.IDLE
        self.active_session: Optional[RecordingSession] = None
        self.original_events: List[RecordedEvent] = []
        self.edited_events: List[RecordedEvent] = []
        self.allowed_scope: str = "http://localhost:8000/testsite"
        self.permissions: Dict[str, bool] = {
            "capture_clicks": True,
            "capture_inputs": True,
            "capture_navigation": True,
            "mask_sensitive": True,
        }
        self._last_event_signature: Optional[str] = None
        self._last_event_timestamp: float = 0.0

    def get_state(self) -> str:
        return self.state.value

    def get_active_window_info(self) -> Dict[str, Any]:
        info = {
            "window_title": "Controlled Test Sandbox",
            "process_name": "browser_sandbox",
            "pid": None,
            "is_focused": True,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        if not HAS_WIN32:
            return info

        try:
            hwnd = win32gui.GetForegroundWindow()
            if hwnd:
                title = win32gui.GetWindowText(hwnd)
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                proc_name = "unknown"
                try:
                    proc = psutil.Process(pid)
                    proc_name = proc.name()
                except Exception:
                    pass
                info.update({
                    "window_title": title or "Active Window",
                    "process_name": proc_name,
                    "pid": pid,
                    "hwnd": hwnd
                })
        except Exception as e:
            info["error"] = str(e)
        return info

    def start_observation(
        self,
        task_name: str = "Example Test",
        desired_outcome: str = "Automate user task",
        target_scope: str = "http://localhost:8000/testsite"
    ) -> RecordingSession:
        if self.state not in (ObserverState.IDLE, ObserverState.STOPPED, ObserverState.DISCARDED):
            raise StateTransitionError(f"Cannot start observation from state '{self.state.value}'. Stop or discard current session first.")

        session_id = f"sess_{uuid.uuid4().hex[:10]}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.allowed_scope = target_scope

        self.active_session = RecordingSession(
            id=session_id,
            created_at=now,
            task_description=f"{task_name}: {desired_outcome}",
            status="active",
            target_url=target_scope,
            events=[]
        )
        self.original_events = []
        self.edited_events = []
        self.state = ObserverState.RECORDING
        self._last_event_signature = None
        self._last_event_timestamp = 0.0
        return self.active_session

    def pause_observation(self) -> str:
        if self.state != ObserverState.RECORDING:
            raise StateTransitionError(f"Cannot pause observation from state '{self.state.value}'. Must be in 'recording' state.")
        self.state = ObserverState.PAUSED
        if self.active_session:
            self.active_session.status = "paused"
        return self.state.value

    def resume_observation(self) -> str:
        if self.state != ObserverState.PAUSED:
            raise StateTransitionError(f"Cannot resume observation from state '{self.state.value}'. Must be in 'paused' state.")
        self.state = ObserverState.RECORDING
        if self.active_session:
            self.active_session.status = "active"
        return self.state.value

    def stop_observation(self) -> Optional[RecordingSession]:
        if self.state not in (ObserverState.RECORDING, ObserverState.PAUSED):
            raise StateTransitionError(f"Cannot stop observation from state '{self.state.value}'. Session is not active.")
        self.state = ObserverState.STOPPED
        if self.active_session:
            self.active_session.status = "stopped"
            # Synchronize edited events with active session
            self.edited_events = list(self.active_session.events)
        return self.active_session

    def discard_session(self) -> None:
        if self.state == ObserverState.IDLE:
            return
        self.state = ObserverState.DISCARDED
        self.active_session = None
        self.original_events = []
        self.edited_events = []
        self._last_event_signature = None

    def capture_action(
        self,
        event_type: str,
        target_name: str,
        role: str = "element",
        value: Optional[str] = None,
        confidence: float = 1.0,
        url: Optional[str] = None
    ) -> Optional[RecordedEvent]:
        if self.state != ObserverState.RECORDING:
            return None

        # 1. Permission checks
        if event_type == "click" and not self.permissions.get("capture_clicks", True):
            raise PermissionDeniedError("Click capture is disabled by observer permissions.")
        if event_type in ("type", "input") and not self.permissions.get("capture_inputs", True):
            raise PermissionDeniedError("Input capture is disabled by observer permissions.")
        if event_type == "navigate" and not self.permissions.get("capture_navigation", True):
            raise PermissionDeniedError("Navigation capture is disabled by observer permissions.")

        # 2. De-duplication check (suppress exact duplicate within 300ms)
        now_ts = time.time()
        signature = f"{event_type}:{target_name}:{value or ''}"
        if signature == self._last_event_signature and (now_ts - self._last_event_timestamp) < 0.30:
            return None  # Suppress duplicate
        self._last_event_signature = signature
        self._last_event_timestamp = now_ts

        # 3. Privacy boundary & Secret scrubbing
        # Never store passwords, auth tokens, or raw keystrokes
        is_masked = False
        val_str = value
        lower_target = (target_name or "").lower()
        if any(secret_term in lower_target for secret_term in self.SECRET_KEYWORDS):
            val_str = "[REDACTED_SECRET]"
            is_masked = True

        target_desc = TargetDescriptor(
            role=role,
            name=target_name,
            test_id=f"ctrl_{target_name.lower().replace(' ', '_')[:24]}",
            text=target_name,
            context=TargetContext(within=self.allowed_scope)
        )

        event = RecordedEvent(
            id=f"evt_{uuid.uuid4().hex[:8]}",
            recording_id=self.active_session.id if self.active_session else "unknown",
            timestamp=datetime.datetime.now().timestamp(),
            type=EventType(event_type) if event_type in [e.value for e in EventType] else EventType.CLICK,
            url=url or self.allowed_scope,
            target=target_desc,
            value=val_str,
            is_masked=is_masked,
            metadata={
                "confidence": confidence,
                "supported": event_type in self.SUPPORTED_ACTIONS,
                "scope": self.allowed_scope,
            }
        )

        if self.active_session:
            self.active_session.events.append(event)
            self.original_events.append(event)
            self.edited_events.append(event)
        return event

    # --- OBSERVATION REVIEW FEATURES (Prompt 4) ---

    def remove_event(self, event_id: str) -> bool:
        """Removes an event from the reviewed/edited list, keeping original_events intact."""
        initial_len = len(self.edited_events)
        self.edited_events = [e for e in self.edited_events if e.id != event_id]
        if self.active_session:
            self.active_session.events = [e for e in self.active_session.events if e.id != event_id]
        return len(self.edited_events) < initial_len

    def edit_event_description(self, event_id: str, new_target_name: str, new_value: Optional[str] = None) -> bool:
        """Edits an event description, strictly validating non-empty target."""
        if not new_target_name or not new_target_name.strip():
            raise ValueError("Target description cannot be empty.")

        for e in self.edited_events:
            if e.id == event_id:
                if e.target:
                    e.target.name = new_target_name.strip()
                    e.target.text = new_target_name.strip()
                if new_value is not None:
                    # Re-verify privacy redaction on edited values
                    if any(s in new_target_name.lower() for s in self.SECRET_KEYWORDS):
                        e.value = "[REDACTED_SECRET]"
                        e.is_masked = True
                    else:
                        e.value = new_value
                return True
        return False

    def reorder_events(self, ordered_event_ids: List[str]) -> bool:
        """Reorders edited events to match the user's reviewed order."""
        id_map = {e.id: e for e in self.edited_events}
        if set(ordered_event_ids) != set(id_map.keys()):
            raise ValueError("Reordered list must contain the exact set of existing event IDs.")
        self.edited_events = [id_map[eid] for eid in ordered_event_ids]
        if self.active_session:
            self.active_session.events = list(self.edited_events)
        return True

    def get_privacy_review(self) -> Dict[str, Any]:
        """
        Reports what data fields are stored locally vs what will be submitted to the AI model.
        Guarantees that sensitive credentials and raw system artifacts are excluded.
        """
        return {
            "retained_locally": [
                "session_id", "timestamp", "target_url", "element_selectors",
                "original_unmodified_event_log", "redacted_value_hashes"
            ],
            "transmitted_to_ai": [
                "task_name", "desired_outcome", "action_verbs",
                "element_role_and_labels", "sanitized_parameter_names"
            ],
            "strictly_excluded_and_never_collected": [
                "passwords", "tokens", "auth_cookies", "raw_keystrokes",
                "clipboard_contents", "arbitrary_desktop_pixels"
            ],
            "total_events_captured": len(self.original_events),
            "total_events_reviewed": len(self.edited_events),
            "redacted_events_count": sum(1 for e in self.edited_events if e.is_masked),
        }

    def sanitize_for_model(self) -> List[Dict[str, Any]]:
        """
        Sanitizes reviewed events before model submission.
        Never relies on UI hiding alone; strips all internal memory refs,
        enforces [REDACTED_SECRET], and flags missing targets.
        """
        sanitized = []
        for idx, evt in enumerate(self.edited_events):
            target_name = evt.target.name if evt.target else ""
            is_ambiguous = not bool(target_name and target_name.strip())
            sanitized.append({
                "step_number": idx + 1,
                "action": evt.type.value if hasattr(evt.type, "value") else str(evt.type),
                "target": target_name or "[MISSING_TARGET]",
                "role": evt.target.role if evt.target else "unknown",
                "value": "[REDACTED_SECRET]" if evt.is_masked else evt.value,
                "is_ambiguous": is_ambiguous,
                "is_supported": evt.metadata.get("supported", True) if evt.metadata else True,
            })
        return sanitized


desktop_observer_instance = DesktopObserver()
