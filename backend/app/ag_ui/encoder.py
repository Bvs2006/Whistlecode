from __future__ import annotations
import json
from typing import Any
from pydantic import BaseModel


class AgUiEventEncoder:
    """Serializes official AG-UI protocol events for Server-Sent Events (SSE) streaming."""

    @staticmethod
    def encode(event: Any) -> str:
        if isinstance(event, BaseModel):
            payload = event.model_dump(mode="json")
            event_type = getattr(event, "type", "message")
            if hasattr(event_type, "value"):
                event_type = event_type.value
            return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        elif isinstance(event, dict):
            event_type = event.get("type", "message")
            return f"event: {event_type}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
        return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    @staticmethod
    def encode_comment(comment: str) -> str:
        return f": {comment}\n\n"

    @staticmethod
    def get_content_type() -> str:
        return "text/event-stream"
