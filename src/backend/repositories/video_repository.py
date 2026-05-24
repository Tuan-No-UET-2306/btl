"""
Video repository — encapsulates all UploadedVideo model database operations.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import UploadedVideo


class VideoRepository:
    """Data access layer for UploadedVideo entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_by_id(self, video_id: int) -> Optional[UploadedVideo]:
        return self.db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()

    def find_by_id_and_user(self, video_id: int, user_id: int) -> Optional[UploadedVideo]:
        return (
            self.db.query(UploadedVideo)
            .filter(UploadedVideo.id == video_id, UploadedVideo.user_id == user_id)
            .first()
        )

    def find_by_user_id(self, user_id: int) -> list[UploadedVideo]:
        return (
            self.db.query(UploadedVideo)
            .filter(UploadedVideo.user_id == user_id)
            .order_by(UploadedVideo.id.desc())
            .all()
        )

    def create(
        self,
        user_id: int,
        video_url: str,
        filename: Optional[str] = None,
        status: str = "queued",
    ) -> UploadedVideo:
        video = UploadedVideo(
            user_id=user_id,
            video_url=video_url,
            filename=filename,
            status=status,
        )
        self.db.add(video)
        self.db.commit()
        self.db.refresh(video)
        return video

    def update_status(self, video: UploadedVideo, status: str) -> UploadedVideo:
        video.status = status
        self.db.commit()
        self.db.refresh(video)
        return video

    def update_processed_video_url(self, video: UploadedVideo, processed_video_url: str) -> UploadedVideo:
        video.processed_video_url = processed_video_url
        self.db.commit()
        self.db.refresh(video)
        return video

    def get_detections_count(self, video_id: int) -> int:
        from ..models.models import VideoDetection

        return (
            self.db.query(VideoDetection)
            .filter(VideoDetection.uploaded_video_id == video_id)
            .count()
        )

    def delete(self, video: UploadedVideo) -> None:
        self.db.delete(video)
        self.db.commit()
