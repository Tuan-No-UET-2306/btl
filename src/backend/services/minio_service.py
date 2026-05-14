from datetime import timedelta
import logging
import os
from pathlib import Path
import tempfile
from urllib.parse import unquote, urlparse
from uuid import uuid4

from minio import Minio

from ..core.config import (
    MINIO_ACCESS_KEY,
    MINIO_BUCKET,
    MINIO_ENDPOINT,
    MINIO_PUBLIC_READ,
    MINIO_PUBLIC_URL,
    MINIO_SECRET_KEY,
    MINIO_SECURE,
)

logger = logging.getLogger(__name__)


class MinioService:
    def __init__(self) -> None:
        self.client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )

    def ensure_bucket(self) -> None:
        try:
            if not self.client.bucket_exists(MINIO_BUCKET):
                self.client.make_bucket(MINIO_BUCKET)
        except Exception as exc:
            logger.warning("MinIO bucket setup skipped: %s", exc)

    def build_object_name(self, filename: str) -> str:
        suffix = Path(filename).suffix or ".bin"
        return f"videos/{uuid4().hex}{suffix}"

    def upload_file(self, upload_file, object_name: str | None = None) -> str:
        if object_name is None:
            object_name = self.build_object_name(upload_file.filename or "upload.bin")

        file_data = upload_file.file
        file_data.seek(0, os.SEEK_END)
        size = file_data.tell()
        file_data.seek(0)

        content_type = upload_file.content_type or "application/octet-stream"
        self.client.put_object(
            MINIO_BUCKET,
            object_name,
            file_data,
            length=size,
            content_type=content_type,
        )
        return self.get_object_url(object_name)

    def get_object_url(self, object_name: str) -> str:
        if MINIO_PUBLIC_READ:
            base = MINIO_PUBLIC_URL.rstrip("/")
            return f"{base}/{MINIO_BUCKET}/{object_name}"
        return self.client.presigned_get_object(
            MINIO_BUCKET,
            object_name,
            expires=timedelta(days=7),
        )

    def get_object_name_from_url(self, object_url: str) -> str:
        parsed = urlparse(object_url)
        path = unquote(parsed.path).lstrip("/")
        bucket_prefix = f"{MINIO_BUCKET}/"
        if path.startswith(bucket_prefix):
            return path[len(bucket_prefix):]
        if path.startswith("videos/"):
            return path
        raise ValueError(f"Cannot resolve MinIO object name from URL: {object_url}")

    def download_url_to_temp_file(self, object_url: str) -> str:
        object_name = self.get_object_name_from_url(object_url)
        suffix = Path(urlparse(object_url).path).suffix or ".mp4"
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_path = temp_file.name
        temp_file.close()

        response = None
        try:
            response = self.client.get_object(MINIO_BUCKET, object_name)
            with open(temp_path, "wb") as file:
                for chunk in response.stream(1024 * 1024):
                    file.write(chunk)
            return temp_path
        except Exception:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
            raise
        finally:
            if response is not None:
                response.close()
                response.release_conn()


minio_service = MinioService()
