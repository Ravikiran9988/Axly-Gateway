import time
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


class ChatCompletionMessage(BaseModel):
    role: Literal["system", "user", "assistant", "function", "tool"] = "user"
    content: Optional[str] = None
    name: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    model: str = Field(description="ID of the model to use")
    messages: List[ChatCompletionMessage] = Field(min_length=1)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=1)
    max_completion_tokens: Optional[int] = Field(default=None, ge=1)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    stop: Optional[Union[str, List[str]]] = None
    frequency_penalty: Optional[float] = Field(default=None, ge=-2.0, le=2.0)
    presence_penalty: Optional[float] = Field(default=None, ge=-2.0, le=2.0)
    stream: bool = False
    response_format: Optional[Dict[str, Any]] = None
    user: Optional[str] = None

    def get_effective_max_tokens(self) -> Optional[int]:
        return self.max_completion_tokens or self.max_tokens


class ChatCompletionChoiceMessage(BaseModel):
    role: str = "assistant"
    content: Optional[str] = None


class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatCompletionChoiceMessage
    finish_reason: Optional[str] = "stop"


class CompletionUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[ChatCompletionChoice]
    usage: Optional[CompletionUsage] = None


# ------------------------------------------------------------------------------
# Streaming SSE Chunks
# ------------------------------------------------------------------------------
class ChatCompletionChunkDelta(BaseModel):
    role: Optional[str] = None
    content: Optional[str] = None


class ChatCompletionChunkChoice(BaseModel):
    index: int = 0
    delta: ChatCompletionChunkDelta
    finish_reason: Optional[str] = None


class ChatCompletionChunk(BaseModel):
    id: str
    object: str = "chat.completion.chunk"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[ChatCompletionChunkChoice]
    usage: Optional[CompletionUsage] = None


# ------------------------------------------------------------------------------
# Model Catalog
# ------------------------------------------------------------------------------
class ModelCard(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str
    capabilities: Optional[Dict[str, Any]] = None
    context_window: Optional[int] = None
    input_price_per_million: Optional[float] = None
    output_price_per_million: Optional[float] = None


class ModelListResponse(BaseModel):
    object: str = "list"
    data: List[ModelCard]
