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

    def find_by_id_and_video(self, detection_id: int, video_id: int) -> Optional[VideoDetection]:
        return (
            self.db.query(VideoDetection)
            .filter(
                VideoDetection.id == detection_id,
                VideoDetection.uploaded_video_id == video_id,
            )
            .first()
        )

    def find_by_video_id(self, video_id: int) -> list[VideoDetection]:
        return (
            self.db.query(VideoDetection)
            .filter(VideoDetection.uploaded_video_id == video_id)
            .order_by(VideoDetection.id.desc())
            .all()
        )

    def find_by_video_plate(self, video_id: int, plate_number: str) -> list[VideoDetection]:
        return (
            self.db.query(VideoDetection)
            .filter(
                VideoDetection.uploaded_video_id == video_id,
                VideoDetection.plate_number == plate_number,
            )
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
        bbox: Optional[list[int]] = None,
        frame_width: Optional[int] = None,
        frame_height: Optional[int] = None,
        is_blacklisted: bool = False,
    ) -> VideoDetection:
        bbox_values = bbox if bbox and len(bbox) == 4 else [None, None, None, None]
        detection = VideoDetection(
            uploaded_video_id=uploaded_video_id,
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            frame_number=frame_number,
            timestamp_seconds=timestamp_seconds,
            bbox_x1=bbox_values[0],
            bbox_y1=bbox_values[1],
            bbox_x2=bbox_values[2],
            bbox_y2=bbox_values[3],
            frame_width=frame_width,
            frame_height=frame_height,
            is_blacklisted=is_blacklisted,
        )
        self.db.add(detection)
        self.db.commit()
        self.db.refresh(detection)
        return detection

    def delete_by_video_id(self, video_id: int) -> int:
        deleted = (
            self.db.query(VideoDetection)
            .filter(VideoDetection.uploaded_video_id == video_id)
            .delete(synchronize_session=False)
        )
        self.db.commit()
        return deleted

    def delete(self, detection: VideoDetection) -> None:
        self.db.delete(detection)
        self.db.commit()

    def delete_by_video_plate(self, video_id: int, plate_number: str) -> int:
        deleted = (
            self.db.query(VideoDetection)
            .filter(
                VideoDetection.uploaded_video_id == video_id,
                VideoDetection.plate_number == plate_number,
            )
            .delete(synchronize_session=False)
        )
        self.db.commit()
        return deleted
