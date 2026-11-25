import json
import logging
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

from app.providers.base import BaseProviderAdapter
from app.providers.exceptions import (
    AuthenticationError,
    InvalidRequestError,
    ModelNotFoundError,
    PermissionError,
    ProviderError,
    ProviderUnavailableError,
    QuotaExceededError,
    RateLimitError,
    SafetyBlockedError,
    UpstreamNetworkError,
    UpstreamTimeoutError,
)
from app.providers.gemini.mapper import (
    from_gemini_chunk,
    from_gemini_response,
    to_gemini_request,
)
from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ModelCard,
)

logger = logging.getLogger("axly.providers.gemini")


class GeminiAdapter(BaseProviderAdapter):
    """
    Adapter for Google Gemini models via Gemini REST v1beta API.
    Supports complete chat, streaming via Server-Sent Events, model discovery, and error normalization.
    """

    DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, base_url: Optional[str] = None, timeout: float = 60.0):
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "gemini"

    def _normalize_model_name(self, model: str) -> str:
        # Strip provider prefix like 'gemini/' or 'models/' if present
        clean = model
        if clean.startswith("gemini/"):
            clean = clean[7:]
        if clean.startswith("models/"):
            clean = clean[7:]
        return clean

    def _handle_http_error(self, response: httpx.Response) -> None:
        """Parses Gemini error payload and raises corresponding normalized ProviderError."""
        status = response.status_code
        try:
            err_data = response.json().get("error", {})
            message = err_data.get("message", response.text)
            status_str = err_data.get("status", "")
        except Exception:
            err_data = {}
            message = response.text or f"HTTP {status}"
            status_str = ""

        if status == 400:
            if "safety" in message.lower():
                raise SafetyBlockedError(message, provider=self.provider_name, details=err_data)
            raise InvalidRequestError(message, provider=self.provider_name, details=err_data)
        elif status in (401, 403):
            if "API_KEY_INVALID" in message or "invalid" in message.lower():
                raise AuthenticationError(message, provider=self.provider_name, details=err_data)
            raise PermissionError(message, provider=self.provider_name, details=err_data)
        elif status == 404:
            raise ModelNotFoundError(message, provider=self.provider_name, details=err_data)
        elif status == 429:
            if "quota" in message.lower() or status_str == "RESOURCE_EXHAUSTED":
                raise QuotaExceededError(message, provider=self.provider_name, details=err_data)
            raise RateLimitError(message, provider=self.provider_name, details=err_data)
        elif status >= 500:
            raise ProviderUnavailableError(message, provider=self.provider_name, details=err_data)
        else:
            raise ProviderError(message, provider=self.provider_name, status_code=status, details=err_data)

    async def validate_credentials(self, api_key: str) -> bool:
        """Pings Gemini models endpoint to verify API key validity."""
        url = f"{self.base_url}/models"
        params = {"key": api_key, "pageSize": 1}
        try:
            client = self.get_http_client(10.0)
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                self._handle_http_error(resp)
            return True
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError(f"Connection to Gemini timed out: {exc}", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Network error connecting to Gemini: {exc}", provider=self.provider_name) from exc

    async def complete_chat(
        self, request: ChatCompletionRequest, api_key: str
    ) -> ChatCompletionResponse:
        clean_model = self._normalize_model_name(request.model)
        url = f"{self.base_url}/models/{clean_model}:generateContent"
        params = {"key": api_key}
        payload = to_gemini_request(request)

        try:
            client = self.get_http_client(self.timeout)
            resp = await client.post(url, params=params, json=payload)
            if resp.status_code != 200:
                self._handle_http_error(resp)
            data = resp.json()
            return from_gemini_response(data, model_id=request.model)
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError("Gemini request timed out", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Network communication with Gemini failed: {exc}", provider=self.provider_name) from exc

    async def stream_chat(
        self, request: ChatCompletionRequest, api_key: str
    ) -> AsyncGenerator[ChatCompletionChunk, None]:
        clean_model = self._normalize_model_name(request.model)
        url = f"{self.base_url}/models/{clean_model}:streamGenerateContent"
        params = {"alt": "sse", "key": api_key}
        payload = to_gemini_request(request)
        completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"

        try:
            client = self.get_http_client(self.timeout)
            async with client.stream("POST", url, params=params, json=payload) as response:
                if response.status_code != 200:
                    content = await response.aread()
                    dummy_resp = httpx.Response(
                        status_code=response.status_code,
                        content=content,
                        request=response.request,
                    )
                    self._handle_http_error(dummy_resp)

                buffer = ""
                async for raw_bytes in response.aiter_bytes():
                    buffer += raw_bytes.decode("utf-8", errors="replace")
                    while "\n\n" in buffer:
                        event_block, buffer = buffer.split("\n\n", 1)
                        for line in event_block.splitlines():
                            line = line.strip()
                            if line.startswith("data:"):
                                json_str = line[5:].strip()
                                if not json_str or json_str == "[DONE]":
                                    continue
                                try:
                                    chunk_dict = json.loads(json_str)
                                    yield from_gemini_chunk(
                                        chunk_dict,
                                        completion_id=completion_id,
                                        model_id=request.model,
                                    )
                                except json.JSONDecodeError:
                                    continue
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError("Gemini stream timed out", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Gemini stream interrupted: {exc}", provider=self.provider_name) from exc

    async def discover_models(self, api_key: str) -> List[ModelCard]:
        url = f"{self.base_url}/models"
        params = {"key": api_key, "pageSize": 100}
        try:
            client = self.get_http_client(15.0)
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                self._handle_http_error(resp)
            data = resp.json().get("models", [])
            result: List[ModelCard] = []
            for m in data:
                model_id = m.get("name", "").replace("models/", "")
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    result.append(
                        ModelCard(
                            id=model_id,
                            owned_by="google",
                            context_window=m.get("inputTokenLimit"),
                            capabilities={
                                "streaming": True,
                                "temperature": True,
                                "top_p": True,
                            },
                        )
                    )
            return result
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError("Gemini model discovery timed out", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Gemini model discovery network error: {exc}", provider=self.provider_name) from exc

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "streaming": True,
            "system_instruction": True,
            "token_usage": True,
            "response_format_json": True,
            "model_discovery": True,
        }
