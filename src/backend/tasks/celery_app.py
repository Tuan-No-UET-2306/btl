"""
Celery application configuration.
Provides distributed task queue for video processing and other background tasks.
Requires a running Redis (or RabbitMQ) broker.
"""

import os

from celery import Celery

# Redis broker URL (fallback: no broker — tasks run synchronously)
BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("CELERY_BACKEND_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "lpr_system",
    broker=BROKER_URL,
    backend=BACKEND_URL,
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
)

# Auto-discover tasks from the tasks module
celery_app.autodiscover_tasks(["src.backend.tasks"])