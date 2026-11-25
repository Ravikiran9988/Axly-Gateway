from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

from app.providers.schemas import (
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ModelCard,
)


class BaseProviderAdapter(ABC):
    """
    Abstract Base Class for LLM Provider Adapters.
    Normalizes requests, responses, streaming, model catalogs, and errors across providers.
    """

    def get_http_client(self, timeout: float) -> httpx.AsyncClient:
        """Return a reusable async HTTP client scoped to this adapter instance."""
        clients = getattr(self, "_http_clients", None)
        if clients is None:
            clients = {}
            self._http_clients = clients
        key = float(timeout)
        client = clients.get(key)
        if client is None or client.is_closed:
            client = httpx.AsyncClient(timeout=timeout, trust_env=False)
            clients[key] = client
        return client

    async def aclose(self) -> None:
        """Close all pooled HTTP clients owned by this adapter."""
        clients = getattr(self, "_http_clients", {})
        for client in clients.values():
            if not client.is_closed:
                await client.aclose()
        clients.clear()

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique identifier for the provider (e.g. 'gemini', 'groq', 'openai')."""
        pass

    @abstractmethod
    async def validate_credentials(self, api_key: str) -> bool:
        """
        Validates API key and tests upstream connectivity.
        Returns True on success, or raises a normalized ProviderError.
        """
        pass

    @abstractmethod
    async def complete_chat(
        self, request: ChatCompletionRequest, api_key: str
    ) -> ChatCompletionResponse:
        """
        Executes a non-streaming chat completion against the upstream provider.
        Returns a normalized OpenAI-compatible ChatCompletionResponse.
        """
        pass

    @abstractmethod
    async def stream_chat(
        self, request: ChatCompletionRequest, api_key: str
    ) -> AsyncGenerator[ChatCompletionChunk, None]:
        """
        Executes a streaming chat completion against the upstream provider.
        Yields normalized OpenAI-compatible ChatCompletionChunk instances.
        """
        pass

    @abstractmethod
    async def discover_models(self, api_key: str) -> List[ModelCard]:
        """
        Discovers dynamically available models from the upstream provider.
        Returns a list of standardized ModelCard items.
        """
        pass

    @abstractmethod
    def get_capabilities(self) -> Dict[str, Any]:
        """
        Returns capability flags and metadata supported by this provider adapter.
        """
        pass
