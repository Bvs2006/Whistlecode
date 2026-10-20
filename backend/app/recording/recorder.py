from __future__ import annotations
import asyncio
import json
import uuid
import base64
import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from ..models.events import RecordedEvent, RecordingSession, EventType
from ..models.workflow import TargetDescriptor
from ..recording.masker import mask_value_if_sensitive
from ..db.database import get_db_connection
from ..audit.logger import AuditLogger

DOM_LISTENER_PATH = Path(__file__).parent / "dom_listener.js"


class BrowserRecorder:
    """
    Manages Playwright browser recording sessions in dedicated disposable contexts (REC-1..8).
    Captures structured user interactions, accessible UI elements, and visual screenshots.
    """

    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.current_session: Optional[RecordingSession] = None
        self.is_paused: bool = False
        self._listener_script: str = ""
        self.capture_screenshots: bool = True

        if DOM_LISTENER_PATH.exists():
            with open(DOM_LISTENER_PATH, "r", encoding="utf-8") as f:
                self._listener_script = f.read()

    async def start_session(self, target_url: str, task_description: str) -> RecordingSession:
        if self.current_session and self.current_session.status == "active":
            await self.stop_session()

        session_id = f"rec_{uuid.uuid4().hex[:10]}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        self.current_session = RecordingSession(
            id=session_id,
            created_at=now,
            task_description=task_description,
            status="active",
            target_url=target_url,
            events=[]
        )
        self.is_paused = False

        # Save to DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO recordings (id, created_at, task_description, status, target_url) VALUES (?, ?, ?, ?, ?)",
            (self.current_session.id, self.current_session.created_at, self.current_session.task_description, "active", target_url)
        )
        conn.commit()
        conn.close()

        AuditLogger.log_event(
            actor="user",
            event_type="RECORDING_STARTED",
            ref_ids={"recording_id": session_id},
            details={"target_url": target_url, "task_description": task_description}
        )

        # Launch disposable browser
        if not self.playwright:
            self.playwright = await async_playwright().start()

        # Dedicated, disposable context - no user profile (REC-8)
        self.browser = await self.playwright.chromium.launch(headless=False)
        self.context = await self.browser.new_context(
            viewport={"width": 1280, "height": 800},
            ignore_https_errors=True
        )
        self.page = await self.context.new_page()

        # Bind event callback
        await self.page.expose_function("whistleCodeEmitEvent", self._handle_client_event)

        # Inject recording script on navigation
        await self.page.add_init_script(self._listener_script)

        # Navigate to target
        await self.page.goto(target_url)

        # Capture initial screenshot
        initial_ss = None
        if self.capture_screenshots and self.page:
            try:
                ss_bytes = await self.page.screenshot(type="jpeg", quality=40)
                initial_ss = f"data:image/jpeg;base64,{base64.b64encode(ss_bytes).decode('utf-8')}"
            except Exception:
                pass

        # Record initial navigate event
        initial_event = RecordedEvent(
            id=f"evt_{uuid.uuid4().hex[:8]}",
            recording_id=session_id,
            timestamp=datetime.datetime.now().timestamp(),
            type=EventType.NAVIGATE,
            url=target_url,
            value=target_url,
            is_masked=False,
            screenshot=initial_ss,
            active_window=await self.page.title() if self.page else "Browser",
            metadata={"initial_navigation": True}
        )
        self._save_event(initial_event)

        return self.current_session

    async def _handle_client_event(self, raw_json: str):
        if not self.current_session or self.current_session.status != "active" or self.is_paused:
            return

        try:
            data = json.loads(raw_json)
            target_data = data.get("target")
            raw_value = data.get("value")
            is_password = data.get("is_password", False)

            masked_val, was_masked = mask_value_if_sensitive(
                raw_value, 
                target_data, 
                input_type="password" if is_password else None
            )

            # Capture visual screenshot at this event moment
            screenshot_b64 = None
            if self.capture_screenshots and self.page:
                try:
                    ss_bytes = await self.page.screenshot(type="jpeg", quality=40)
                    screenshot_b64 = f"data:image/jpeg;base64,{base64.b64encode(ss_bytes).decode('utf-8')}"
                except Exception:
                    pass

            target_desc = TargetDescriptor(**target_data) if target_data else None

            event = RecordedEvent(
                id=f"evt_{uuid.uuid4().hex[:8]}",
                recording_id=self.current_session.id,
                timestamp=datetime.datetime.now().timestamp(),
                type=EventType(data.get("type", "click")),
                url=data.get("url", self.page.url if self.page else ""),
                target=target_desc,
                value=masked_val,
                is_masked=was_masked or is_password,
                screenshot=screenshot_b64,
                active_window=data.get("active_window") or (await self.page.title() if self.page else "Browser"),
                metadata=data.get("metadata", {})
            )
            self._save_event(event)
        except Exception as e:
            print(f"[WhistleCode Recorder] Error parsing client event: {e}")

    def _save_event(self, event: RecordedEvent):
        if not self.current_session:
            return
        self.current_session.events.append(event)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO events (id, recording_id, ts, type, url, target_json, value_masked, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.id,
                event.recording_id,
                event.timestamp,
                event.type.value,
                event.url,
                event.target.model_dump_json() if event.target else None,
                event.value,
                json.dumps({
                    **event.metadata,
                    "screenshot": event.screenshot,
                    "active_window": event.active_window
                })
            )
        )
        conn.commit()
        conn.close()

    def pause_session(self):
        self.is_paused = True
        if self.current_session:
            self.current_session.status = "paused"

    def resume_session(self):
        self.is_paused = False
        if self.current_session:
            self.current_session.status = "active"

    async def stop_session(self) -> Optional[RecordingSession]:
        if not self.current_session:
            return None

        self.current_session.status = "stopped"
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE recordings SET status = 'stopped' WHERE id = ?", (self.current_session.id,))
        conn.commit()
        conn.close()

        AuditLogger.log_event(
            actor="user",
            event_type="RECORDING_STOPPED",
            ref_ids={"recording_id": self.current_session.id},
            details={"events_count": len(self.current_session.events)}
        )

        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
        except Exception:
            pass

        stopped_session = self.current_session
        self.context = None
        self.browser = None
        self.page = None
        return stopped_session


recorder_instance = BrowserRecorder()
