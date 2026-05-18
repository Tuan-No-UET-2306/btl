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

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_BACKEND_URL = os.getenv("CELERY_BACKEND_URL", "redis://localhost:6379/0")
REDIS_URL = os.getenv("REDIS_URL", CELERY_BROKER_URL)
REDIS_EVENT_CHANNEL = os.getenv("REDIS_EVENT_CHANNEL", "lpr:events")

ROBOFLOW_API_URL = os.getenv("ROBOFLOW_API_URL", "https://serverless.roboflow.com")
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "nr1cK7LuYg2NIRcPqpyw")
ROBOFLOW_WORKSPACE_NAME = os.getenv("ROBOFLOW_WORKSPACE_NAME", "no-anonymous")
ROBOFLOW_WORKFLOW_ID = os.getenv("ROBOFLOW_WORKFLOW_ID", "general-segmentation-api-2")
ROBOFLOW_CLASSES = os.getenv("ROBOFLOW_CLASSES", "plate")
ROBOFLOW_USE_CACHE = _bool_env("ROBOFLOW_USE_CACHE", True)

VIDEO_OCR_MODEL_PATH = os.getenv("VIDEO_OCR_MODEL_PATH", "src/models/LP_ocr_nano_62.onnx")
VIDEO_PROCESS_EVERY_N_FRAMES = max(1, int(os.getenv("VIDEO_PROCESS_EVERY_N_FRAMES", "10")))
VIDEO_PROCESS_MAX_FRAMES = max(1, int(os.getenv("VIDEO_PROCESS_MAX_FRAMES", "900")))
VIDEO_DETECT_CONFIDENCE = float(os.getenv("VIDEO_DETECT_CONFIDENCE", "0.35"))
VIDEO_OCR_CONFIDENCE = float(os.getenv("VIDEO_OCR_CONFIDENCE", "0.35"))
VIDEO_UPLOAD_FRAME_CROPS = _bool_env("VIDEO_UPLOAD_FRAME_CROPS", True)
