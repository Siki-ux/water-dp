"""
Shared storage utilities for filename sanitization.
"""

from app.core.exceptions import ValidationException


def sanitize_object_name(filename: str) -> str:
    """Sanitize a user-supplied filename to a safe MinIO object key.

    Strips path components, rejects empty/relative names, and ensures
    the result is a plain basename with no directory traversal.
    Works on both POSIX and Windows by normalising backslashes first.
    """
    name = filename.replace("\\", "/")
    name = name.rsplit("/", 1)[-1].strip()
    if not name or name in (".", ".."):
        raise ValidationException("Invalid filename")
    return name
