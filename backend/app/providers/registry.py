import logging
from typing import Dict, List, Optional
from app.providers.base import BaseProviderAdapter
from app.providers.gemini.adapter import GeminiAdapter
from app.providers.groq.adapter import GroqAdapter
from app.providers.openai.adapter import OpenAIAdapter
from app.providers.exceptions import ProviderError

logger = logging.getLogger("axly.providers.registry")


class ProviderRegistry:
    """Central registry holding active provider adapter instances."""

    def __init__(self):
        self._adapters: Dict[str, BaseProviderAdapter] = {}
        self._custom_adapters: Dict[tuple[str, str], BaseProviderAdapter] = {}
        # Register standard default adapters
        self.register(GeminiAdapter())
        self.register(GroqAdapter())
        self.register(OpenAIAdapter())

    def register(self, adapter: BaseProviderAdapter) -> None:
        self._adapters[adapter.provider_name.lower()] = adapter
        logger.info(f"Registered provider adapter: {adapter.provider_name}")

    def get(self, provider_name: str, base_url: Optional[str] = None) -> BaseProviderAdapter:
        key = provider_name.lower().strip()
        if key not in self._adapters:
            raise ProviderError(
                f"Unsupported or unregistered provider: {provider_name}",
                provider=provider_name,
                status_code=400,
            )
        default_adapter = self._adapters[key]
        if not base_url or base_url.rstrip("/") == getattr(default_adapter, "base_url", "").rstrip("/"):
            return default_adapter
        custom_key = (key, base_url.rstrip("/"))
        adapter = self._custom_adapters.get(custom_key)
        if adapter is None:
            adapter = default_adapter.__class__(base_url=custom_key[1])
            self._custom_adapters[custom_key] = adapter
        return adapter

    async def aclose_all(self) -> None:
        """Close pooled HTTP clients for default and custom provider adapters."""
        adapters = list(self._adapters.values()) + list(self._custom_adapters.values())
        for adapter in adapters:
            await adapter.aclose()
        self._custom_adapters.clear()

    def list_providers(self) -> List[str]:
        return list(self._adapters.keys())

    def resolve_provider_for_model(self, model_name: str) -> str:
        """
        Infers the upstream provider from the model identifier.
        Supports explicit prefixes like 'gemini/gemini-1.5-pro' or known standard prefixes.
        """
        lower = model_name.lower().strip()
        if lower.startswith("gemini/") or lower.startswith("google/"):
            return "gemini"
        elif lower.startswith("groq/"):
            return "groq"
        elif lower.startswith("openai/"):
            return "openai"

        # Heuristic detection for common un-prefixed models
        if "gemini" in lower:
            return "gemini"
        elif any(k in lower for k in ("llama", "mixtral", "gemma-7b", "whisper-large-v3")):
            return "groq"
        elif any(k in lower for k in ("gpt-", "o1", "o3", "text-embedding")):
            return "openai"

        # Default fallback
        return "openai"


# Global registry singleton
registry = ProviderRegistry()


def get_provider_registry() -> ProviderRegistry:
    return registry
