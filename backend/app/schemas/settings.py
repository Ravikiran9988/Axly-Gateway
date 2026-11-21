from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel


class SystemSettingUpdate(BaseModel):
    value: Dict[str, Any]
    description: Optional[str] = None


class SystemSettingResponse(BaseModel):
    key: str
    value: Dict[str, Any]
    description: Optional[str] = None
    is_secret: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
