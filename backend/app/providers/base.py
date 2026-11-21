from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
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
