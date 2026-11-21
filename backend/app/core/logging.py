import logging
import re
import sys
from typing import Any, Dict


# Common patterns for API secrets, bearer tokens, passwords, and keys
REDACTION_PATTERNS = [
    # Authorization header: Bearer ...
    (re.compile(r"(Bearer\s+)[A-Za-z0-9_\-\.]{10,}", re.IGNORECASE), r"\1[REDACTED]"),
    # OpenAI style keys: sk-...
    (re.compile(r"sk-[A-Za-z0-9_\-]{20,}", re.IGNORECASE), "sk-[REDACTED]"),
    # AXLY gateway keys: axly_live_...
    (re.compile(r"axly_(?:live|test)_[A-Za-z0-9_\-]{16,}", re.IGNORECASE), r"axly_[REDACTED]"),
    # Gemini / Google style API keys: AIzaSy...
    (re.compile(r"AIzaSy[A-Za-z0-9_\-]{30,}", re.IGNORECASE), "AIzaSy[REDACTED]"),
    # Groq style keys: gsk_...
    (re.compile(r"gsk_[A-Za-z0-9_\-]{20,}", re.IGNORECASE), "gsk_[REDACTED]"),
    # JSON or form fields like "password": "...", "client_secret": "..."
    (
        re.compile(
            r'("(?:password|secret|api_key|token|access_token|refresh_token)"\s*:\s*")[^"]+(")',
            re.IGNORECASE,
        ),
        r"\1[REDACTED]\2",
    ),
]


class SecretRedactingFilter(logging.Filter):
    """
    Filter that inspects and redacts sensitive tokens, credentials, and passwords
    from all log record messages and arguments before writing to streams or files.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._redact_value(v) for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(self._redact_value(arg) for arg in record.args)
        return True

    @classmethod
    def redact(cls, text: str) -> str:
        if not text or not isinstance(text, str):
            return text
        result = text
        for pattern, replacement in REDACTION_PATTERNS:
            result = pattern.sub(replacement, result)
        return result

    @classmethod
    def _redact_value(cls, val: Any) -> Any:
        if isinstance(val, str):
            return cls.redact(val)
        return val


def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """
    Configures application-wide structured logging with secret redaction filter.
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    logger = logging.getLogger("axly")
    logger.setLevel(numeric_level)

    # Avoid duplicate handlers if already configured
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(numeric_level)
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] [req_id:%(request_id)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(SecretRedactingFilter())
        logger.addHandler(handler)

    # Provide default request_id attribute for standard log records
    old_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return record

    logging.setLogRecordFactory(record_factory)
    return logger
