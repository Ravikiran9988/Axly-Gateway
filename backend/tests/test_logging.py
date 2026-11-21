import logging
from app.core.logging import SecretRedactingFilter


def test_secret_redacting_filter_bearer_token():
    filt = SecretRedactingFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Request received with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef1234567890",
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert "[REDACTED]" in record.msg
    assert "eyJhbGci" not in record.msg


def test_secret_redacting_filter_api_keys():
    filt = SecretRedactingFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="Calling provider with sk-proj-1234567890abcdef1234567890 and axly_live_abcdef1234567890123456",
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert "sk-[REDACTED]" in record.msg
    assert "axly_[REDACTED]" in record.msg


def test_secret_redacting_filter_json_passwords():
    filt = SecretRedactingFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg='Payload: {"email": "user@test.com", "password": "MySuperSecretPassword123"}',
        args=(),
        exc_info=None,
    )
    filt.filter(record)
    assert '"password": "[REDACTED]"' in record.msg
    assert "MySuperSecretPassword123" not in record.msg
