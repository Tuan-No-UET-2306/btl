"""
VideoDetection repository — encapsulates all VideoDetection model database operations.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import VideoDetection


class VideoDetectionRepository:
    """Data access layer for VideoDetection entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_by_id(self, detection_id: int) -> Optional[VideoDetection]:
        return self.db.query(VideoDetection).filter(VideoDetection.id == detection_id).first()

    def find_by_video_id(self, video_id: int) -> list[VideoDetection]:
        return (
            self.db.query(VideoDetection)
            .filter(VideoDetection.uploaded_video_id == video_id)
            .order_by(VideoDetection.id.desc())
            .all()
        )

    def create(
        self,
        uploaded_video_id: int,
        plate_number: str,
        confidence: float,
        image_url: Optional[str] = None,
        frame_number: Optional[int] = None,
        timestamp_seconds: Optional[float] = None,
        is_blacklisted: bool = False,
    ) -> VideoDetection:
        detection = VideoDetection(
            uploaded_video_id=uploaded_video_id,
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            frame_number=frame_number,
            timestamp_seconds=timestamp_seconds,
            is_blacklisted=is_blacklisted,
        )
        self.db.add(detection)
        self.db.commit()
        self.db.refresh(detection)
        return detection