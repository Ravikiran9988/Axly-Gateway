from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class GeminiPart(BaseModel):
    text: Optional[str] = None


class GeminiContent(BaseModel):
    role: str = "user"  # "user" or "model"
    parts: List[GeminiPart]


class GeminiGenerationConfig(BaseModel):
    temperature: Optional[float] = None
    maxOutputTokens: Optional[int] = None
    topP: Optional[float] = None
    stopSequences: Optional[List[str]] = None


class GeminiSystemInstruction(BaseModel):
    parts: List[GeminiPart]
