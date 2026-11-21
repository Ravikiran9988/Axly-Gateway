import httpx
import pytest

from app.providers.exceptions import (
    AuthenticationError,
    InvalidRequestError,
    ModelNotFoundError,
    PermissionError,
    ProviderUnavailableError,
    QuotaExceededError,
    RateLimitError,
    SafetyBlockedError,
    UpstreamNetworkError,
    UpstreamTimeoutError,
)
from app.routing.error_classifier import ErrorClassifier
from app.routing.schemas import ErrorCategory, QuotaScope


def test_classify_400_bad_request():
    exc = InvalidRequestError("Invalid temperature parameter: must be between 0 and 2", provider="openai")
    res = ErrorClassifier.classify(exc)
    assert res.category == ErrorCategory.BAD_REQUEST
    assert res.is_retryable is False
    assert res.status_code == 400


def test_classify_400_safety_blocked():
    exc = SafetyBlockedError("Prompt blocked due to safety violations", provider="gemini")
    res = ErrorClassifier.classify(exc)
    assert res.category == ErrorCategory.SAFETY_BLOCKED
    assert res.is_retryable is False
    assert res.status_code == 400


def test_classify_401_authentication_failure():
    exc = AuthenticationError("Invalid API key provided", provider="groq")
    res = ErrorClassifier.classify(exc)
    assert res.category == ErrorCategory.AUTHENTICATION
    assert res.is_retryable is False
    assert res.scope == QuotaScope.CREDENTIAL
    assert res.status_code == 401


def test_classify_403_permission_failure():
    exc = PermissionError("User not authorized for this project", provider="openai")
    res = ErrorClassifier.classify(exc)
    assert res.category == ErrorCategory.PERMISSION
    assert res.is_retryable is False
    assert res.scope == QuotaScope.CREDENTIAL
    assert res.status_code == 403


def test_classify_403_project_quota_identified():
    # When provider returns 403 with quota message (e.g. Google Cloud)
    exc = PermissionError("Quota exceeded for project: Resource exhausted", provider="gemini")
    res = ErrorClassifier.classify(exc)
    assert res.category == ErrorCategory.QUOTA_EXHAUSTED
    assert res.is_retryable is True
    assert res.scope == QuotaScope.PROJECT


def test_classify_404_model_not_found():
    exc = ModelNotFoundError("The model 'gpt-5-turbo' does not exist", provider="openai")
    res = ErrorClassifier.classify(exc)
    assert res.category == ErrorCategory.MODEL_NOT_FOUND
    assert res.is_retryable is False
    assert res.scope == QuotaScope.MODEL_FAMILY
    assert res.status_code == 404


def test_classify_429_rate_limit_vs_quota():
    # Rate limit (RPM/TPM)
    exc_rl = RateLimitError("Rate limit reached: 30 requests per minute", provider="groq")
    res_rl = ErrorClassifier.classify(exc_rl)
    assert res_rl.category == ErrorCategory.RATE_LIMIT
    assert res_rl.is_retryable is True
    assert res_rl.scope == QuotaScope.CREDENTIAL

    # Project Quota exhausted
    exc_quota = QuotaExceededError("You exceeded your current quota, please check your plan and billing", provider="openai")
    res_quota = ErrorClassifier.classify(exc_quota)
    assert res_quota.category == ErrorCategory.QUOTA_EXHAUSTED
    assert res_quota.is_retryable is True
    assert res_quota.scope == QuotaScope.PROJECT


def test_classify_500_502_503_504_transient_failures():
    # 503 Service Unavailable
    exc_503 = ProviderUnavailableError("The server is temporarily overloaded", provider="gemini")
    res_503 = ErrorClassifier.classify(exc_503)
    assert res_503.category == ErrorCategory.SERVICE_UNAVAILABLE
    assert res_503.is_retryable is True
    assert res_503.status_code == 503

    # 502 Bad Gateway / Network Error
    exc_502 = UpstreamNetworkError("Connection reset by peer", provider="groq")
    res_502 = ErrorClassifier.classify(exc_502)
    assert res_502.category == ErrorCategory.NETWORK_ERROR
    assert res_502.is_retryable is True

    # 504 Gateway Timeout
    exc_504 = UpstreamTimeoutError("Upstream timed out waiting for response", provider="openai")
    res_504 = ErrorClassifier.classify(exc_504)
    assert res_504.category == ErrorCategory.TIMEOUT
    assert res_504.is_retryable is True


def test_classify_timeout_and_network_exceptions():
    exc_timeout = httpx.ReadTimeout("Read timeout after 30.0s")
    res_timeout = ErrorClassifier.classify(exc_timeout)
    assert res_timeout.category == ErrorCategory.TIMEOUT
    assert res_timeout.is_retryable is True

    exc_connect = httpx.ConnectError("Failed to resolve host api.groq.com")
    res_connect = ErrorClassifier.classify(exc_connect)
    assert res_connect.category == ErrorCategory.NETWORK_ERROR
    assert res_connect.is_retryable is True


def test_retry_after_header_parsing():
    headers = {"retry-after": "45"}
    exc = httpx.HTTPStatusError("Rate limit", request=None, response=httpx.Response(429, headers=headers))
    res = ErrorClassifier.classify(exc)
    assert res.retry_after_seconds == 45.0
    assert res.cooldown_seconds >= 45.0
