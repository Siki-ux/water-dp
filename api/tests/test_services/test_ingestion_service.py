import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import AppException, ResourceNotFoundException
from app.services.ingestion_service import IngestionService


def _make_upload_file(
    content: bytes = b"content",
    filename: str = "test.csv",
    content_type: str = "text/csv",
) -> MagicMock:
    """Create a MagicMock UploadFile with a real BytesIO backing file for seek/tell support."""
    upload_file = MagicMock()
    upload_file.filename = filename
    upload_file.content_type = content_type
    upload_file.file = io.BytesIO(content)
    upload_file.read = AsyncMock(return_value=content)
    return upload_file


@pytest.fixture
def mock_timeio_db():
    with patch("app.services.ingestion_service.TimeIODatabase") as mock:
        yield mock


@pytest.fixture
def mock_minio():
    with patch("app.services.ingestion_service.Minio") as mock:
        yield mock


@pytest.mark.asyncio
async def test_upload_csv_success(mock_timeio_db, mock_minio):
    thing_uuid = "uuid"
    upload_file = _make_upload_file()

    # Mock DB config
    mock_db_instance = mock_timeio_db.return_value
    mock_db_instance.get_s3_config.return_value = {
        "bucket": "b",
        "user": "u",
        "password": "p",
    }

    # Mock Minio
    mock_client = mock_minio.return_value

    result = await IngestionService.upload_csv(thing_uuid, upload_file)

    assert result["status"] == "success"
    mock_client.put_object.assert_called_once()
    assert mock_client.put_object.call_args[1]["bucket_name"] == "b"


@pytest.mark.asyncio
async def test_upload_csv_no_config(mock_timeio_db):
    thing_uuid = "uuid"
    upload_file = MagicMock()

    mock_db_instance = mock_timeio_db.return_value
    mock_db_instance.get_s3_config.return_value = None

    with pytest.raises(ResourceNotFoundException):
        await IngestionService.upload_csv(thing_uuid, upload_file)


@pytest.mark.asyncio
async def test_upload_csv_minio_error(mock_timeio_db, mock_minio):
    thing_uuid = "uuid"
    upload_file = _make_upload_file()

    # Mock DB config
    mock_db_instance = mock_timeio_db.return_value
    mock_db_instance.get_s3_config.return_value = {
        "bucket": "b",
        "user": "u",
        "password": "p",
    }

    # Mock Minio Error
    from minio.error import S3Error

    mock_client = mock_minio.return_value
    mock_client.put_object.side_effect = S3Error(
        "code", "msg", "res", "req", "host", "b"
    )

    with pytest.raises(AppException):
        await IngestionService.upload_csv(thing_uuid, upload_file)
