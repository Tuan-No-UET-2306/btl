"""
Celery application configuration.
Provides distributed task queue for video processing and other background tasks.
Uses Redis as the broker/result backend by default.
"""

from celery import Celery

from ..core.config import (
    CELERY_BACKEND_URL,
    CELERY_BROKER_URL,
    CELERY_TASK_ALWAYS_EAGER,
)

celery_app = Celery(
    "lpr_system",
    broker=CELERY_BROKER_URL,
    backend=CELERY_BACKEND_URL,
    include=["src.backend.tasks.video_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_always_eager=CELERY_TASK_ALWAYS_EAGER,
    task_store_eager_result=True,
    broker_connection_retry_on_startup=True,
    task_default_queue="video_processing",
)
