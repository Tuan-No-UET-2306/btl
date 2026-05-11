import os


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


def _int_env(key: str, default: int) -> int:
    value = os.getenv(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _float_env(key: str, default: float) -> float:
    value = os.getenv(key)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:khongmk@localhost:5432/postgres",
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

LPR_DETECTOR_MODEL_PATH = os.getenv(
    "LPR_DETECTOR_MODEL_PATH",
    "src/models/LP_detector_nano_61.onnx",
)
LPR_OCR_MODEL_PATH = os.getenv(
    "LPR_OCR_MODEL_PATH",
    "src/models/LP_ocr_nano_62.onnx",
)

VIDEO_PROCESS_EVERY_N_FRAMES = _int_env("VIDEO_PROCESS_EVERY_N_FRAMES", 1)
VIDEO_PROCESS_MAX_FRAMES = _int_env("VIDEO_PROCESS_MAX_FRAMES", 900)
VIDEO_DETECT_CONFIDENCE = _float_env("VIDEO_DETECT_CONFIDENCE", 0.35)
VIDEO_OCR_CONFIDENCE = _float_env("VIDEO_OCR_CONFIDENCE", 0.35)
VIDEO_STREAM_MAX_WIDTH = _int_env("VIDEO_STREAM_MAX_WIDTH", 720)
VIDEO_STREAM_JPEG_QUALITY = _int_env("VIDEO_STREAM_JPEG_QUALITY", 78)
