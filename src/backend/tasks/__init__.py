try:
    from .celery_app import celery_app
except Exception:  # pragma: no cover - lets the API boot even before celery is installed
    celery_app = None

from .video_tasks import enqueue_video_processing, process_video_task

__all__ = ["celery_app", "enqueue_video_processing", "process_video_task"]
