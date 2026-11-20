from __future__ import annotations
import json
import re
import logging
from typing import Optional, Dict, Any
from ..integrations.ai_providers import AIProviderRouter, BaseAIProvider
from .models import TaskRepresentation, TaskInput, TargetHints

logger = logging.getLogger(__name__)

TASK_UNDERSTANDING_SYSTEM_PROMPT = """You are WhistleCode's Task Understanding Engine.
Analyze the user's automation request and output a STRICT JSON object representing the task.
Do NOT output markdown blocks or conversational text. Output ONLY valid JSON matching the schema.

Schema requirements:
{
  "intent": "Concise summary of user's core intent",
  "category": "browser_navigation" | "data_extraction" | "desktop_ui" | "document_processing" | "form_filling" | "general",
  "operations": ["navigate", "type", "click", "extract", "assert", ...],
  "required_tools": ["playwright_browser", "filesystem", ...],
  "inputs": {
    "param_name": {
      "name": "param_name",
      "type": "string" | "number" | "boolean",
      "value": "extracted value or null",
      "is_missing": true | false,
      "description": "what this input is for"
    }
  },
  "expected_output": "Description of what success looks like upon completion",
  "permissions": ["network_access", "read_file", "browser_control", ...],
  "surfaces": ["browser"] | ["desktop"] | ["file"] | ["browser", "file"],
  "target_hints": {
    "urls": ["http://..."],
    "app_names": ["notepad", "calc", ...],
    "paths": ["/data/...", "C:/..."]
  },
  "surface_confidence": 0.0 to 1.0
}

Rules:
1. Surfaces must reflect where the automation happens: web pages -> ["browser"], desktop software/OS apps -> ["desktop"], files/sandbox -> ["file"].
2. If essential parameters or credentials are required but not provided in the prompt, mark them in "inputs" with "is_missing": true.
3. Extract explicit URLs into target_hints.urls, desktop applications into target_hints.app_names, file paths into target_hints.paths.
4. Set surface_confidence between 0.0 and 1.0 based on how clear the requested environment is.
"""


def _extract_json_from_llm(text: str) -> Dict[str, Any]:
    text = text.strip()
    # Strip markdown code blocks if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text.strip())


async def understand_task(
    prompt: str,
    ai_provider: Optional[BaseAIProvider] = None,
    max_retries: int = 2
) -> TaskRepresentation:
    """
    Analyzes a user prompt using structured output and Pydantic validation with repair retries.
    Uses AI router / provider directly with zero keyword matching.
    """
    if not prompt or not prompt.strip():
        raise ValueError("Cannot understand empty prompt")

    router = ai_provider or AIProviderRouter()
    messages = [
        {"role": "system", "content": TASK_UNDERSTANDING_SYSTEM_PROMPT},
        {"role": "user", "content": f"Analyze this automation task prompt:\n{prompt}"}
    ]

    last_error: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            raw_response = await router.generate_text(
                messages=messages,
                temperature=0.1,
                response_format="json_object"
            )
            parsed_json = _extract_json_from_llm(raw_response)
            task_rep = TaskRepresentation.model_validate(parsed_json)
            return task_rep

        except Exception as e:
            last_error = e
            logger.warning(f"Task representation parsing attempt {attempt + 1} failed: {e}")
            if attempt < max_retries:
                messages.append({"role": "assistant", "content": raw_response if 'raw_response' in locals() else "{}"})
                messages.append({
                    "role": "user",
                    "content": f"The previous output failed validation with error: {str(e)}. Please correct and output ONLY valid JSON matching the exact schema."
                })

    raise ValueError(f"Failed to produce a valid TaskRepresentation after {max_retries + 1} attempts: {last_error}")
