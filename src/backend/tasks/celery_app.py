"""
Celery application configuration.
Provides distributed task queue for video processing and other background tasks.
Requires a running Redis (or RabbitMQ) broker.
"""

import platform

from celery import Celery

from ..core.config import CELERY_BACKEND_URL, CELERY_BROKER_URL

celery_app = Celery(
    "lpr_system",
    broker=CELERY_BROKER_URL,
    backend=CELERY_BACKEND_URL,
)

pool_config = {"worker_pool": "solo"} if platform.system() == "Windows" else {}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    imports=("src.backend.tasks.video_tasks",),
    **pool_config,
)