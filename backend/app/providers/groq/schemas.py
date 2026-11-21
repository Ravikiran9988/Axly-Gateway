from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class GroqChatParameters(BaseModel):
    model: str
    messages: List[Dict[str, Any]]
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    stream: bool = False
    stop: Optional[Any] = None
