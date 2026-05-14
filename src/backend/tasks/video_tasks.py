"""
Video processing tasks.
Can run as Celery async tasks or synchronous background tasks (fallback).
"""

import logging
from random import uniform

from ..core.config import DATABASE_URL
from ..models.database import SessionLocal
from ..models.models import UploadedVideo, VideoDetection
from ..socket.manager import manager

logger = logging.getLogger(__name__)


class ProcessVideoTask:
    """
    Encapsulates video processing logic.
    Designed to work both as a Celery task and as a synchronous BackgroundTasks callable.
    """

    def run_sync(self, video_id: int) -> None:
        """Run video processing synchronously (FastAPI BackgroundTasks fallback)."""
        logger.info("Starting sync video processing: video_id=%d", video_id)
        self._process(video_id)

    def run(self, video_id: int) -> None:
        """Run video processing (called by Celery)."""
        logger.info("Starting Celery video processing: video_id=%d", video_id)
        self._process(video_id)

    def _process(self, video_id: int) -> None:
        """Core processing logic."""
        db = SessionLocal()
        try:
            video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
            if not video:
                logger.warning("Video not found: video_id=%d", video_id)
                return

            # Simulate detection processing
            # In production, this would call LPRService on video frames
            confidence = round(uniform(0.85, 0.98), 2)
            detection = VideoDetection(
                uploaded_video_id=video_id,
                plate_number="29A-123.45",
                confidence=confidence,
                image_url=None,
                frame_number=None,
                timestamp_seconds=None,
                is_blacklisted=False,
            )
            db.add(detection)

            video.status = "done"
            db.commit()

            manager.broadcast_event(
                {
                    "event": "video_processed",
                    "video_id": video_id,
                    "status": video.status,
                },
                video_id=video_id,
            )

            logger.info(
                "Video processed successfully: video_id=%d, plate=%s, conf=%.2f",
                video_id,
                "29A-123.45",
                confidence,
            )
        except Exception as e:
            logger.error("Video processing failed: video_id=%d, error=%s", video_id, e)
            db.rollback()
        finally:
            db.close()


# Singleton instance for both sync and async use
process_video_task = ProcessVideoTask()