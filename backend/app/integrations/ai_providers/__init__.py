from __future__ import annotations
import os
import json
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, AsyncGenerator
import httpx

from app.credentials.store import get_secret

logger = logging.getLogger(__name__)


class BaseAIProvider(ABC):
    """Abstract base class for ChronicleAI LLM providers."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: Optional[str] = None,
    ) -> str:
        """Generates a complete response."""
        pass

    @abstractmethod
    async def stream_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        """Streams text response tokens."""
        pass

    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """Tests provider API reachability and authentication."""
        pass


class GeminiProvider(BaseAIProvider):
    """Google Gemini AI Provider using direct REST API."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.0-flash"):
        super().__init__("Google Gemini")
        self.model = model
        self._explicit_key = api_key

    def get_api_key(self) -> Optional[str]:
        if self._explicit_key:
            return self._explicit_key
        # Check credential vault
        stored = get_secret("integ_gemini")
        if stored:
            return stored
        # Check environment variables
        return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    async def test_connection(self) -> Dict[str, Any]:
        key = self.get_api_key()
        if not key:
            return {
                "status": "not_configured",
                "message": "Gemini API key is not configured. Add it in Integrations to enable Google Gemini.",
            }
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    models = resp.json().get("models", [])
                    return {
                        "status": "success",
                        "message": f"Connected to Google Gemini. {len(models)} models accessible.",
                        "model": self.model,
                    }
                return {
                    "status": "error",
                    "message": f"Gemini API returned HTTP {resp.status_code}: {resp.text[:200]}",
                }
        except Exception as exc:
            return {"status": "error", "message": f"Gemini connection failed: {str(exc)}"}

    def _convert_messages(self, messages: List[Dict[str, str]]) -> tuple[Optional[str], List[Dict[str, Any]]]:
        system_instruction = None
        contents: List[Dict[str, Any]] = []

        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                system_instruction = content
            else:
                gemini_role = "model" if role == "assistant" else "user"
                contents.append({
                    "role": gemini_role,
                    "parts": [{"text": content}]
                })
        
        if not contents:
            contents.append({"role": "user", "parts": [{"text": "Hello"}]})
        return system_instruction, contents

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: Optional[str] = None,
    ) -> str:
        key = self.get_api_key()
        if not key:
            raise RuntimeError("Gemini API key is not configured.")

        system_instruction, contents = self._convert_messages(messages)
        body: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            }
        }
        if response_format == "json":
            body["generationConfig"]["responseMimeType"] = "application/json"
        if system_instruction:
            body["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={key}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)

    async def stream_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        key = self.get_api_key()
        if not key:
            raise RuntimeError("Gemini API key is not configured.")

        system_instruction, contents = self._convert_messages(messages)
        body: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            }
        }
        if system_instruction:
            body["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?key={key}&alt=sse"
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=body) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    payload_str = line[6:].strip()
                    if payload_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload_str)
                        candidates = chunk.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            for part in parts:
                                text = part.get("text", "")
                                if text:
                                    yield text
                    except Exception:
                        continue


class GroqProvider(BaseAIProvider):
    """Groq Provider for ultra-fast fallback inference."""

    def __init__(self, api_key: Optional[str] = None, model: str = "llama-3.3-70b-versatile"):
        super().__init__("Groq")
        self.model = model
        self._explicit_key = api_key

    def get_api_key(self) -> Optional[str]:
        if self._explicit_key:
            return self._explicit_key
        stored = get_secret("integ_groq")
        if stored:
            return stored
        return os.getenv("GROQ_API_KEY")

    async def test_connection(self) -> Dict[str, Any]:
        key = self.get_api_key()
        if not key:
            return {
                "status": "not_configured",
                "message": "Groq API key is not configured. Add it in Integrations to enable Groq fallback.",
            }
        url = "https://api.groq.com/openai/v1/models"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers={"Authorization": f"Bearer {key}"})
                if resp.status_code == 200:
                    models = resp.json().get("data", [])
                    return {
                        "status": "success",
                        "message": f"Connected to Groq. {len(models)} models available.",
                        "model": self.model,
                    }
                return {"status": "error", "message": f"Groq API error HTTP {resp.status_code}"}
        except Exception as exc:
            return {"status": "error", "message": f"Groq connection failed: {str(exc)}"}

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: Optional[str] = None,
    ) -> str:
        key = self.get_api_key()
        if not key:
            raise RuntimeError("Groq API key is not configured.")

        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format == "json":
            body["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        key = self.get_api_key()
        if not key:
            raise RuntimeError("Groq API key is not configured.")

        body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=body,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        chunk = json.loads(raw)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except Exception:
                        continue


class OllamaProvider(BaseAIProvider):
    """Local Ollama Provider."""

    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        super().__init__("Ollama")
        self.base_url = (base_url or os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")).rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", "mistral:latest")

    async def test_connection(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    models = resp.json().get("models", [])
                    return {
                        "status": "success",
                        "message": f"Ollama is running locally. {len(models)} local models found.",
                        "model": self.model,
                    }
                return {"status": "error", "message": f"Ollama HTTP {resp.status_code}"}
        except Exception:
            return {
                "status": "unavailable",
                "message": "Local Ollama server is offline or unreachable at " + self.base_url,
            }

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: Optional[str] = None,
    ) -> str:
        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if response_format == "json":
            body["format"] = "json"

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{self.base_url}/api/chat", json=body)
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "")

    async def stream_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        body = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {"temperature": temperature},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=body) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if chunk.get("done"):
                            break
                    except Exception:
                        continue


class AIProviderRouter:
    """
    Unified AI Provider Router.
    Prioritizes Gemini (primary), falls back to Groq, then local Ollama,
    and finally resilient offline conversational responses.
    """

    def __init__(self):
        self.gemini = GeminiProvider()
        self.groq = GroqProvider()
        self.ollama = OllamaProvider()

    def get_active_provider(self) -> BaseAIProvider:
        # 1. Prefer Gemini if configured
        if self.gemini.get_api_key():
            return self.gemini
        # 2. Prefer Groq if configured
        if self.groq.get_api_key():
            return self.groq
        # 3. Fall back to Ollama
        return self.ollama

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_format: Optional[str] = None,
    ) -> str:
        # Try primary Gemini
        if self.gemini.get_api_key():
            try:
                return await self.gemini.generate_text(messages, temperature, max_tokens, response_format)
            except Exception as e:
                logger.warning(f"Gemini generation failed, trying fallback: {e}")

        # Try Groq fallback
        if self.groq.get_api_key():
            try:
                return await self.groq.generate_text(messages, temperature, max_tokens, response_format)
            except Exception as e:
                logger.warning(f"Groq generation failed, trying fallback: {e}")

        # Try Ollama fallback
        try:
            return await self.ollama.generate_text(messages, temperature, max_tokens, response_format)
        except Exception as e:
            logger.warning(f"Ollama generation failed: {e}")
            raise RuntimeError("No configured AI Provider is currently reachable. Please configure Gemini or Groq API keys in Integrations.")

    async def stream_text(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        # 1. Gemini
        if self.gemini.get_api_key():
            try:
                async for chunk in self.gemini.stream_text(messages, temperature):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"Gemini streaming failed: {e}")

        # 2. Groq
        if self.groq.get_api_key():
            try:
                async for chunk in self.groq.stream_text(messages, temperature):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"Groq streaming failed: {e}")

        # 3. Ollama
        try:
            async for chunk in self.ollama.stream_text(messages, temperature):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"Ollama streaming failed: {e}")

        # 4. Resilient intelligent fallback
        last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        fallback_words = self._get_smart_fallback(last_user_msg).split(" ")
        for i, word in enumerate(fallback_words):
            yield word + (" " if i < len(fallback_words) - 1 else "")
            await asyncio.sleep(0.015)

    def _get_smart_fallback(self, query: str) -> str:
        q = query.lower().strip()
        if any(q.startswith(g) for g in ["hi", "hello", "hey", "greetings"]):
            return (
                "Hello! I am your **ChronicleAI Assistant**.\n\n"
                "I help you automate desktop, browser, and enterprise workflows without repetitive manual work:\n\n"
                "- **Teach a Task**: Demonstrate tasks once with browser recording.\n"
                "- **Templates**: 1-click ready-to-run automation recipes.\n"
                "- **AI Agents**: Configure autonomous agents with skills and persistent memory.\n"
                "- **Automations**: Schedule workflows with Cron or webhooks.\n\n"
                "To connect live generative models, configure your **Google Gemini** or **Groq** API key in the **Integrations** tab!"
            )
        return (
            f"I received your request: **'{query}'**.\n\n"
            "To unlock full natural language synthesis, configure your **Google Gemini** key in the **Integrations** hub. "
            "In the meantime, you can execute pre-built recipes from the **Templates** gallery or click **Record Demonstration** to synthesize tasks from your actual browser actions."
        )


ai_router = AIProviderRouter()
