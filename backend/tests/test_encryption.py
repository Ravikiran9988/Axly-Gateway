import pytest
from app.services.encryption import (
    CredentialEncryptionService,
    EncryptionError,
    get_encryption_service,
)


def test_credential_encryption_and_decryption():
    service = get_encryption_service()
    raw_api_key = "sk-proj-9876543210abcdeffedcba0123456789"

    encrypted = service.encrypt(raw_api_key)
    assert encrypted.startswith("v1:")
    assert raw_api_key not in encrypted

    decrypted = service.decrypt(encrypted)
    assert decrypted == raw_api_key


def test_encryption_tamper_detection():
    service = get_encryption_service()
    raw_secret = "gsk_super_secret_groq_api_token"
    encrypted = service.encrypt(raw_secret)

    # Tamper with the ciphertext payload
    parts = encrypted.split(":")
    tampered_ciphertext = parts[2][:-2] + "ff"
    tampered_payload = f"{parts[0]}:{parts[1]}:{tampered_ciphertext}"

    with pytest.raises(EncryptionError):
        service.decrypt(tampered_payload)


def test_mask_secret_helper():
    masked_openai = CredentialEncryptionService.mask_secret("sk-1234567890abcdef")
    assert masked_openai == "sk-1...cdef"

    short = CredentialEncryptionService.mask_secret("short")
    assert short == "***"
