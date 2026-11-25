import uuid
from datetime import datetime
from typing import Optional
from urllib.parse import urlsplit
from pydantic import BaseModel, Field, field_validator


class ProviderBase(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=2, max_length=128)
    description: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: bool = True
    config_schema: Optional[dict] = None

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: Optional[str], info):
        if value is None or not value.strip():
            return None
        parsed = urlsplit(value.strip())
        expected_hosts = {
            "gemini": "generativelanguage.googleapis.com",
            "groq": "api.groq.com",
            "openai": "api.openai.com",
        }
        provider_name = str(info.data.get("name", "")).lower()
        expected_host = expected_hosts.get(provider_name)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.hostname.lower() != expected_host
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.port not in (None, 443)
        ):
            raise ValueError(
                "Custom base_url must use HTTPS and the official hostname for the selected provider"
            )
        return value.strip().rstrip("/")


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: Optional[bool] = None
    config_schema: Optional[dict] = None

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: Optional[str]):
        if value is None or not value.strip():
            return None
        parsed = urlsplit(value.strip())
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.port not in (None, 443)
        ):
            raise ValueError("base_url must use HTTPS without credentials, query, or fragment")
        return value.strip().rstrip("/")


class ProviderResponse(ProviderBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
