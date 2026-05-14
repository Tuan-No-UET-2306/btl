"""Video management endpoints — upload, list, detail, queue, detections."""
from fastapi import APIRouter, Depends, File, UploadFile, status
from kombu.exceptions import KombuError, OperationalError
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ...core.exceptions import AppException
from ...models.models import User
from ...models.schemas import (
    VideoDetectionCreate,
    VideoDetectionResponse,
    VideoDetailResponse,
    VideoResponse,
    VideoUploadResponse,
)
from ...services.video_service import VideoService
from ...tasks.video_tasks import process_video_celery_task

router = APIRouter()


@router.post("/", response_model=VideoUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = VideoService(db)
    return service.upload_video(user_id=current_user.id, file=file)


@router.get("/", response_model=list[VideoResponse])
def list_videos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = VideoService(db)
    return service.list_videos(user_id=current_user.id)


@router.get("/{video_id}", response_model=VideoDetailResponse)
def get_video_detail(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = VideoService(db)
    return service.get_video_detail(video_id=video_id, user_id=current_user.id)


@router.get("/{video_id}/detections", response_model=list[VideoDetectionResponse])
def list_video_detections(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = VideoService(db)
    return service.list_video_detections(video_id=video_id, user_id=current_user.id)


@router.post(
    "/{video_id}/detections",
    response_model=VideoDetectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_video_detection(
    video_id: int,
    payload: VideoDetectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = VideoService(db)
    return service.create_video_detection(
        video_id=video_id,
        user_id=current_user.id,
        plate_number=payload.plate_number,
        confidence=payload.confidence,
        image_url=payload.image_url,
        frame_number=payload.frame_number,
        timestamp_seconds=payload.timestamp_seconds,
        is_blacklisted=payload.is_blacklisted,
    )


@router.post("/{video_id}/queue")
def queue_video(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = VideoService(db)
    video = service.queue_video_processing(
        video_id=video_id,
        user_id=current_user.id,
    )

    try:
        task = process_video_celery_task.delay(video.id)
    except (KombuError, OperationalError) as exc:
        raise AppException(
            code="queue_unavailable",
            detail=f"Could not enqueue video processing task: {exc}",
            status_code=503,
        ) from exc

    return {"message": "queued", "video_id": video.id, "task_id": task.id}
