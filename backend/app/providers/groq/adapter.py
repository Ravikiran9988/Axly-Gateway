import json
import logging
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
    UpstreamNetworkError,
    UpstreamTimeoutError,
)
from app.providers.groq.mapper import (
    from_groq_chunk,
    from_groq_response,
    to_groq_request,
)
from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ModelCard,
)

logger = logging.getLogger("axly.providers.groq")


class GroqAdapter(BaseProviderAdapter):
    """
    Dedicated Adapter for Groq's high-speed inference engine.
    Uses Groq's OpenAI-compatible REST API interface.
    """

    DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(self, base_url: Optional[str] = None, timeout: float = 60.0):
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "groq"

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key.strip()}",
            "Content-Type": "application/json",
        }

    def _handle_http_error(self, response: httpx.Response) -> None:
        status = response.status_code
        try:
            err_data = response.json().get("error", {})
            message = err_data.get("message", response.text)
            code = err_data.get("code", "")
        except Exception:
            err_data = {}
            message = response.text or f"HTTP {status}"
            code = ""

        if status == 400:
            raise InvalidRequestError(message, provider=self.provider_name, details=err_data)
        elif status == 401:
            raise AuthenticationError(message, provider=self.provider_name, details=err_data)
        elif status == 403:
            raise PermissionError(message, provider=self.provider_name, details=err_data)
        elif status == 404:
            raise ModelNotFoundError(message, provider=self.provider_name, details=err_data)
        elif status == 429:
            if "quota" in message.lower() or "insufficient_quota" in code:
                raise QuotaExceededError(message, provider=self.provider_name, details=err_data)
            raise RateLimitError(message, provider=self.provider_name, details=err_data)
        elif status >= 500:
            raise ProviderUnavailableError(message, provider=self.provider_name, details=err_data)
        else:
            raise ProviderError(message, provider=self.provider_name, status_code=status, details=err_data)

    async def validate_credentials(self, api_key: str) -> bool:
        url = f"{self.base_url}/models"
        headers = self._get_headers(api_key)
        try:
            client = self.get_http_client(10.0)
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                self._handle_http_error(resp)
            return True
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError(f"Connection to Groq timed out: {exc}", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Network error connecting to Groq: {exc}", provider=self.provider_name) from exc

    async def complete_chat(
        self, request: ChatCompletionRequest, api_key: str
    ) -> ChatCompletionResponse:
        url = f"{self.base_url}/chat/completions"
        headers = self._get_headers(api_key)
        payload = to_groq_request(request)
        payload["stream"] = False

        try:
            client = self.get_http_client(self.timeout)
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                self._handle_http_error(resp)
            data = resp.json()
            return from_groq_response(data, requested_model=request.model)
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError("Groq request timed out", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Network communication with Groq failed: {exc}", provider=self.provider_name) from exc

    async def stream_chat(
        self, request: ChatCompletionRequest, api_key: str
    ) -> AsyncGenerator[ChatCompletionChunk, None]:
        url = f"{self.base_url}/chat/completions"
        headers = self._get_headers(api_key)
        payload = to_groq_request(request)
        payload["stream"] = True

        try:
            client = self.get_http_client(self.timeout)
            async with client.stream("POST", url, headers=headers, json=payload) as response:
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
                                    yield from_groq_chunk(chunk_dict, requested_model=request.model)
                                except json.JSONDecodeError:
                                    continue
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError("Groq stream timed out", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Groq stream interrupted: {exc}", provider=self.provider_name) from exc

    async def discover_models(self, api_key: str) -> List[ModelCard]:
        url = f"{self.base_url}/models"
        headers = self._get_headers(api_key)
        try:
            client = self.get_http_client(15.0)
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                self._handle_http_error(resp)
            data = resp.json().get("data", [])
            result: List[ModelCard] = []
            for m in data:
                model_id = m.get("id")
                if model_id:
                    result.append(
                        ModelCard(
                            id=model_id,
                            owned_by=m.get("owned_by", "groq"),
                            context_window=m.get("context_window"),
                            capabilities={
                                "streaming": True,
                                "temperature": True,
                                "top_p": True,
                            },
                        )
                    )
            return result
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError("Groq model discovery timed out", provider=self.provider_name) from exc
        except httpx.RequestError as exc:
            raise UpstreamNetworkError(f"Groq model discovery network error: {exc}", provider=self.provider_name) from exc

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "streaming": True,
            "system_instruction": True,
            "token_usage": True,
            "response_format_json": True,
            "model_discovery": True,
        }
