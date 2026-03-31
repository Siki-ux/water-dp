"""Tests for DatasetService._sanitize_object_name helper."""

import pytest

from app.core.exceptions import ValidationException
from app.services.dataset_service import _sanitize_object_name


class TestSanitizeObjectName:
    """Ensure traversal, empty, and Windows-style paths are handled."""

    def test_plain_filename(self):
        assert _sanitize_object_name("data.csv") == "data.csv"

    def test_strips_unix_path(self):
        assert _sanitize_object_name("/etc/passwd") == "passwd"

    def test_strips_relative_traversal(self):
        assert _sanitize_object_name("../../../etc/passwd") == "passwd"

    def test_strips_windows_path(self):
        assert _sanitize_object_name("C:\\Users\\admin\\file.csv") == "file.csv"

    def test_strips_leading_trailing_spaces(self):
        assert _sanitize_object_name("  file.csv  ") == "file.csv"

    def test_rejects_empty_string(self):
        with pytest.raises(ValidationException):
            _sanitize_object_name("")

    def test_rejects_dot(self):
        with pytest.raises(ValidationException):
            _sanitize_object_name(".")

    def test_rejects_dotdot(self):
        with pytest.raises(ValidationException):
            _sanitize_object_name("..")

    def test_rejects_spaces_only(self):
        with pytest.raises(ValidationException):
            _sanitize_object_name("   ")

    def test_traversal_dotdot_slash(self):
        assert _sanitize_object_name("../x.csv") == "x.csv"

    def test_double_traversal(self):
        assert _sanitize_object_name("../../secret.csv") == "secret.csv"

    def test_mixed_separators(self):
        assert _sanitize_object_name("foo/bar\\baz.csv") == "baz.csv"

    def test_filename_with_special_chars(self):
        result = _sanitize_object_name("my file (1).csv")
        assert result == "my file (1).csv"
