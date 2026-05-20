import os

from dotenv import load_dotenv


load_dotenv()


def _bool_env(key: str, default: bool) -> bool:
    value = os.getenv(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _list_env(key: str, default: list[str]) -> list[str]:
    raw = os.getenv(key)
    if raw is None:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not configured. Copy .env.example to .env and set the Supabase PostgreSQL URL."
    )

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

CORS_ORIGINS = _list_env(
    "CORS_ORIGINS",
    [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "uploaded-videos")
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")
MINIO_PUBLIC_READ = _bool_env("MINIO_PUBLIC_READ", True)
MINIO_SECURE = _bool_env("MINIO_SECURE", False)

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_BACKEND_URL = os.getenv("CELERY_BACKEND_URL", "redis://localhost:6379/0")
REDIS_URL = os.getenv("REDIS_URL", CELERY_BROKER_URL)
REDIS_EVENT_CHANNEL = os.getenv("REDIS_EVENT_CHANNEL", "lpr:events")

VIDEO_DETECT_MODEL_PATH = os.getenv("VIDEO_DETECT_MODEL_PATH", "src/models/LP_detector_nano_61.onnx")
VIDEO_OCR_MODEL_PATH = os.getenv("VIDEO_OCR_MODEL_PATH", "src/models/LP_ocr_nano_62.onnx")
VIDEO_DETECT_IMAGE_SIZE = max(320, int(os.getenv("VIDEO_DETECT_IMAGE_SIZE", "640")))
VIDEO_OCR_IMAGE_SIZE = max(160, int(os.getenv("VIDEO_OCR_IMAGE_SIZE", "640")))
VIDEO_PROCESS_EVERY_N_FRAMES = max(1, int(os.getenv("VIDEO_PROCESS_EVERY_N_FRAMES", "10")))
VIDEO_PROCESS_MAX_FRAMES = max(1, int(os.getenv("VIDEO_PROCESS_MAX_FRAMES", "900")))
VIDEO_DETECT_CONFIDENCE = float(os.getenv("VIDEO_DETECT_CONFIDENCE", "0.35"))
VIDEO_OCR_CONFIDENCE = float(os.getenv("VIDEO_OCR_CONFIDENCE", "0.35"))
VIDEO_REALTIME_DETECT_IMAGE_SIZE = max(320, int(os.getenv("VIDEO_REALTIME_DETECT_IMAGE_SIZE", "640")))
VIDEO_REALTIME_OCR_IMAGE_SIZE = max(160, int(os.getenv("VIDEO_REALTIME_OCR_IMAGE_SIZE", "640")))
VIDEO_REALTIME_DETECT_CONFIDENCE = float(os.getenv("VIDEO_REALTIME_DETECT_CONFIDENCE", "0.35"))
VIDEO_REALTIME_MAX_PLATES = max(1, int(os.getenv("VIDEO_REALTIME_MAX_PLATES", "2")))
VIDEO_REALTIME_CROP_CACHE_TTL_SECONDS = max(
    1,
    int(os.getenv("VIDEO_REALTIME_CROP_CACHE_TTL_SECONDS", "45")),
)
VIDEO_REALTIME_CROP_CACHE_MAX_ITEMS = max(
    1,
    int(os.getenv("VIDEO_REALTIME_CROP_CACHE_MAX_ITEMS", "256")),
)
VIDEO_REALTIME_CROP_JPEG_QUALITY = min(
    95,
    max(30, int(os.getenv("VIDEO_REALTIME_CROP_JPEG_QUALITY", "72"))),
)
VIDEO_UPLOAD_FRAME_CROPS = _bool_env("VIDEO_UPLOAD_FRAME_CROPS", True)
VIDEO_PROCESS_SYNC_FALLBACK = _bool_env("VIDEO_PROCESS_SYNC_FALLBACK", False)
