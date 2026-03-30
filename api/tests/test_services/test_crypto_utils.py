"""
Unit tests for app.services.timeio.crypto_utils.
"""

import base64
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet


def _valid_fernet_key() -> str:
    """Generate a real Fernet key for testing."""
    return Fernet.generate_key().decode()


class TestGetFernet:
    def test_returns_fernet_instance(self):
        key = _valid_fernet_key()
        with patch("app.services.timeio.crypto_utils.settings") as mock_settings:
            mock_settings.fernet_encryption_secret = key
            from app.services.timeio.crypto_utils import get_fernet

            f = get_fernet()
            assert isinstance(f, Fernet)

    def test_raises_when_no_key(self):
        with patch("app.services.timeio.crypto_utils.settings") as mock_settings:
            mock_settings.fernet_encryption_secret = None
            from app.services.timeio.crypto_utils import get_fernet

            with pytest.raises(ValueError, match="FERNET_ENCRYPTION_SECRET"):
                get_fernet()


class TestEncryptDecrypt:
    def test_round_trip(self):
        key = _valid_fernet_key()
        with patch("app.services.timeio.crypto_utils.settings") as mock_settings:
            mock_settings.fernet_encryption_secret = key
            from app.services.timeio.crypto_utils import (
                decrypt_password,
                encrypt_password,
            )

            original = "mysecretpassword"
            encrypted = encrypt_password(original)
            assert encrypted != original

            decrypted = decrypt_password(encrypted)
            assert decrypted == original

    def test_decrypt_returns_token_on_failure(self):
        key = _valid_fernet_key()
        with patch("app.services.timeio.crypto_utils.settings") as mock_settings:
            mock_settings.fernet_encryption_secret = key
            from app.services.timeio.crypto_utils import decrypt_password

            # Invalid token — should return the original (bad) token instead of raising
            result = decrypt_password("this-is-not-valid-fernet")
            assert result == "this-is-not-valid-fernet"

    def test_encrypt_returns_string(self):
        key = _valid_fernet_key()
        with patch("app.services.timeio.crypto_utils.settings") as mock_settings:
            mock_settings.fernet_encryption_secret = key
            from app.services.timeio.crypto_utils import encrypt_password

            result = encrypt_password("testpass")
            assert isinstance(result, str)


class TestHashPasswordPbkdf2:
    def test_returns_pbkdf2_format(self):
        from app.services.timeio.crypto_utils import hash_password_pbkdf2

        result = hash_password_pbkdf2("mypassword")
        parts = result.split("$")
        assert parts[0] == "PBKDF2"
        assert parts[1] == "sha512"
        assert parts[2] == "100000"
        assert len(parts) == 5  # PBKDF2$sha512$iterations$salt$hash

    def test_different_passwords_produce_different_hashes(self):
        from app.services.timeio.crypto_utils import hash_password_pbkdf2

        h1 = hash_password_pbkdf2("password1")
        h2 = hash_password_pbkdf2("password2")
        assert h1 != h2

    def test_same_password_different_salt(self):
        from app.services.timeio.crypto_utils import hash_password_pbkdf2

        h1 = hash_password_pbkdf2("samepass")
        h2 = hash_password_pbkdf2("samepass")
        # Should differ due to random salt
        assert h1 != h2

    def test_custom_iterations(self):
        from app.services.timeio.crypto_utils import hash_password_pbkdf2

        result = hash_password_pbkdf2("pass", iterations=1000)
        assert "$1000$" in result

    def test_salt_is_base64_encoded(self):
        from app.services.timeio.crypto_utils import hash_password_pbkdf2

        result = hash_password_pbkdf2("pass")
        parts = result.split("$")
        salt_b64 = parts[3]
        # Should decode without error
        decoded = base64.b64decode(salt_b64)
        assert len(decoded) == 16
