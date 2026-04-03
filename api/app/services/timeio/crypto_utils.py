import base64
import hashlib
import secrets
import logging

from cryptography.fernet import Fernet

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_fernet() -> Fernet:
    """Get Fernet instance using the shared secret."""
    key = settings.fernet_encryption_secret
    if not key:
        raise ValueError("FERNET_ENCRYPTION_SECRET is not set in environment")
    return Fernet(key)


def encrypt_password(password: str) -> str:
    """Encrypt password using Fernet (used for ConfigDB)."""
    return get_fernet().encrypt(password.encode()).decode()


def decrypt_password(token: str) -> str:
    """Decrypt password using Fernet."""
    try:
        return get_fernet().decrypt(token.encode()).decode()
    except Exception as e:
        logger.warning(f"Decryption failed: {e}")
        return token


def hash_password_pbkdf2(password: str, iterations: int = 100000) -> str:
    """
    Hash password using PBKDF2-SHA512 (Mosquitto Go Auth format).
    Format: PBKDF2$sha512$iterations$salt$hash
    """
    # Generate 16 bytes of random salt (matches mosquitto_pw utility)
    salt_bytes = secrets.token_bytes(16)
    # Encode salt in base64 (string representation used in the hash string)
    salt_b64 = base64.b64encode(salt_bytes).decode("utf-8")

    # Hash the password using the BYTES as salt (CRITICAL: broker decodes the b64 salt)
    dk = hashlib.pbkdf2_hmac(
        "sha512", password.encode("utf-8"), salt_bytes, iterations
    )
    # Encode hash in base64
    dk_b64 = base64.b64encode(dk).decode("utf-8")

    return f"PBKDF2$sha512${iterations}${salt_b64}${dk_b64}"
