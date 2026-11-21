import os
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

from app.core.config import get_settings


class EncryptionError(Exception):
    """Raised when encryption or decryption fails."""
    pass


class CredentialEncryptionService:
    """
    Authenticated Encryption Service using AES-256-GCM.
    
    Protects sensitive credentials (such as external LLM API keys) at rest.
    Output format: 'v1:<nonce_hex>:<ciphertext_with_tag_hex>'
    """

    CURRENT_VERSION = "v1"

    def __init__(self, master_key_hex: Optional[str] = None):
        if not master_key_hex:
            master_key_hex = get_settings().ENCRYPTION_MASTER_KEY
        try:
            self._key_bytes = bytes.fromhex(master_key_hex.strip())
            if len(self._key_bytes) != 32:
                raise ValueError("Key must be 32 bytes (64 hex characters)")
            self._aesgcm = AESGCM(self._key_bytes)
        except Exception as e:
            raise EncryptionError(f"Invalid master encryption key: {e}") from e

    def encrypt(self, plaintext: str, associated_data: Optional[bytes] = None) -> str:
        """
        Encrypts plaintext string with AES-256-GCM.
        Generates a fresh 96-bit (12-byte) nonce for every encryption.
        """
        if not plaintext:
            raise ValueError("Cannot encrypt empty or null plaintext")
        try:
            nonce = os.urandom(12)
            data_bytes = plaintext.encode("utf-8")
            ciphertext = self._aesgcm.encrypt(nonce, data_bytes, associated_data)
            return f"{self.CURRENT_VERSION}:{nonce.hex()}:{ciphertext.hex()}"
        except Exception as e:
            raise EncryptionError(f"Encryption failed: {e}") from e

    def decrypt(self, encrypted_payload: str, associated_data: Optional[bytes] = None) -> str:
        """
        Decrypts an encrypted payload string formatted as 'v1:<nonce_hex>:<ciphertext_hex>'.
        Validates authentication tag and raises EncryptionError if tampered or corrupt.
        """
        if not encrypted_payload:
            raise ValueError("Cannot decrypt empty or null payload")

        parts = encrypted_payload.split(":")
        if len(parts) != 3:
            raise EncryptionError("Invalid encrypted payload format")

        version, nonce_hex, ciphertext_hex = parts
        if version != self.CURRENT_VERSION:
            raise EncryptionError(f"Unsupported payload version: {version}")

        try:
            nonce = bytes.fromhex(nonce_hex)
            ciphertext = bytes.fromhex(ciphertext_hex)
            decrypted_bytes = self._aesgcm.decrypt(nonce, ciphertext, associated_data)
            return decrypted_bytes.decode("utf-8")
        except InvalidTag as e:
            raise EncryptionError("Decryption authentication failed: data corrupted or key mismatched") from e
        except Exception as e:
            raise EncryptionError(f"Decryption failed: {e}") from e

    @staticmethod
    def mask_secret(secret: str, visible_start: int = 4, visible_end: int = 4) -> str:
        """
        Creates a safe preview of a secret string for UI display.
        Example: 'sk-1234567890abcdef' -> 'sk-1...cdef'
        """
        if not secret:
            return ""
        if len(secret) <= (visible_start + visible_end):
            return "***"
        return f"{secret[:visible_start]}...{secret[-visible_end:]}"


# Global default instance
_encryption_service: Optional[CredentialEncryptionService] = None


def get_encryption_service() -> CredentialEncryptionService:
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = CredentialEncryptionService()
    return _encryption_service
