"""
Video service — business logic for video upload, processing, and detection management.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..core.exceptions import BadRequestException, NotFoundException
from ..models.models import UploadedVideo, VideoDetection
from ..repositories.video_detection_repository import VideoDetectionRepository
from ..repositories.video_repository import VideoRepository
from ..services.minio_service import minio_service
from ..socket.manager import manager


class VideoService:
    """Business logic for video management."""

    def __init__(self, db: Session) -> None:
        self.video_repo = VideoRepository(db)
        self.video_detection_repo = VideoDetectionRepository(db)

    def upload_video(self, user_id: int, file) -> UploadedVideo:
        """
        Upload a video file to MinIO and create a database record.
        Raises BadRequestException if file is missing or upload fails.
        """
        if not file.filename:
            raise BadRequestException(detail="Missing filename")

        try:
            video_url = minio_service.upload_file(file)
        except Exception as exc:
            raise BadRequestException(detail=f"Upload failed: {str(exc)}")

        video = self.video_repo.create(
            user_id=user_id,
            video_url=video_url,
            filename=file.filename,
            status="queued",
        )

        manager.broadcast_event(
            {"event": "video_uploaded", "video_id": video.id, "status": video.status},
            video_id=video.id,
        )
        return video

    def list_videos(self, user_id: int) -> list[UploadedVideo]:
        """Return all videos for a user with detection counts."""
        videos = self.video_repo.find_by_user_id(user_id)
        for video in videos:
            count = self.video_repo.get_detections_count(video.id)
            video.detections_count = count
        return videos

    def get_video_detail(self, video_id: int, user_id: int) -> UploadedVideo:
        """
        Return video with detections. Raises NotFoundException if not found.
        """
        video = self.video_repo.find_by_id_and_user(video_id, user_id)
        if not video:
            raise NotFoundException(detail=f"Video with id '{video_id}' not found")

        detections = self.video_detection_repo.find_by_video_id(video_id)
        video.detections = detections
        video.detections_count = len(detections)
        return video

    def list_video_detections(self, video_id: int, user_id: int) -> list[VideoDetection]:
        """Return all detections for a video."""
        video = self.video_repo.find_by_id_and_user(video_id, user_id)
        if not video:
            raise NotFoundException(detail=f"Video with id '{video_id}' not found")
        return self.video_detection_repo.find_by_video_id(video_id)

    def create_video_detection(
        self,
        video_id: int,
        user_id: int,
        plate_number: str,
        confidence: float,
        image_url: Optional[str] = None,
        frame_number: Optional[int] = None,
        timestamp_seconds: Optional[float] = None,
        is_blacklisted: bool = False,
    ) -> VideoDetection:
        """Create a new detection for a video and broadcast event."""
        video = self.video_repo.find_by_id_and_user(video_id, user_id)
        if not video:
            raise NotFoundException(detail=f"Video with id '{video_id}' not found")

        detection = self.video_detection_repo.create(
            uploaded_video_id=video_id,
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            frame_number=frame_number,
            timestamp_seconds=timestamp_seconds,
            is_blacklisted=is_blacklisted,
        )
        self.video_repo.update_status(video, "done")

        manager.broadcast_event(
            {
                "event": "video_detection_created",
                "video_id": video_id,
                "detection_id": detection.id,
            },
            video_id=video_id,
        )
        return detection

    def queue_video_processing(
        self,
        video_id: int,
        user_id: int,
    ) -> UploadedVideo:
        """Queue a video for processing."""
        video = self.video_repo.find_by_id_and_user(video_id, user_id)
        if not video:
            raise NotFoundException(detail=f"Video with id '{video_id}' not found")

        self.video_repo.update_status(video, "queued")

        manager.broadcast_event(
            {"event": "video_queued", "video_id": video.id, "status": video.status},
            video_id=video.id,
        )
        return video
