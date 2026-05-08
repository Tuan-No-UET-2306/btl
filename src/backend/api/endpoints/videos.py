from random import uniform

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ...models.database import SessionLocal
from ...models.models import UploadedVideo, User, VideoDetection
from ...models.schemas import (
    VideoDetectionCreate,
    VideoDetectionResponse,
    VideoDetailResponse,
    VideoProcessRequest,
    VideoResponse,
    VideoUploadResponse,
)
from ...services.minio_service import minio_service
from ...socket.manager import manager

router = APIRouter()


def _get_video(db: Session, video_id: int) -> UploadedVideo:
    video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return video


def _process_video_task(video_id: int, payload: VideoProcessRequest) -> None:
    db = SessionLocal()
    try:
        video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
        if not video:
            return

        if payload.create_demo_detection:
            confidence = (
                payload.confidence
                if payload.confidence is not None
                else round(uniform(0.85, 0.98), 2)
            )
            detection = VideoDetection(
                uploaded_video_id=video_id,
                plate_number=payload.plate_number or "29A-123.45",
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
    finally:
        db.close()


@router.post("/", response_model=VideoUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")

    try:
        video_url = minio_service.upload_file(file)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed") from exc

    video = UploadedVideo(
        user_id=current_user.id,
        video_url=video_url,
        filename=file.filename,
        status="queued",
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    manager.broadcast_event(
        {"event": "video_uploaded", "video_id": video.id, "status": video.status},
        video_id=video.id,
    )
    return video


@router.get("/", response_model=list[VideoResponse])
def list_videos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    videos = db.query(UploadedVideo).order_by(UploadedVideo.id.desc()).all()
    for video in videos:
        count = (
            db.query(VideoDetection)
            .filter(VideoDetection.uploaded_video_id == video.id)
            .count()
        )
        video.detections_count = count
    return videos


@router.get("/{video_id}", response_model=VideoDetailResponse)
def get_video_detail(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = _get_video(db, video_id)
    detections = (
        db.query(VideoDetection)
        .filter(VideoDetection.uploaded_video_id == video_id)
        .order_by(VideoDetection.id.desc())
        .all()
    )
    video.detections = detections
    video.detections_count = len(detections)
    return video


@router.get("/{video_id}/detections", response_model=list[VideoDetectionResponse])
def list_video_detections(
    video_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_video(db, video_id)
    return (
        db.query(VideoDetection)
        .filter(VideoDetection.uploaded_video_id == video_id)
        .order_by(VideoDetection.id.desc())
        .all()
    )


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
    video = _get_video(db, video_id)

    detection = VideoDetection(
        uploaded_video_id=video_id,
        plate_number=payload.plate_number,
        confidence=payload.confidence,
        image_url=payload.image_url,
        frame_number=payload.frame_number,
        timestamp_seconds=payload.timestamp_seconds,
        is_blacklisted=payload.is_blacklisted,
    )
    db.add(detection)
    video.status = "done"
    db.commit()
    db.refresh(detection)

    manager.broadcast_event(
        {
            "event": "video_detection_created",
            "video_id": video_id,
            "detection_id": detection.id,
        },
        video_id=video_id,
    )
    return detection


@router.post("/{video_id}/queue")
def queue_video(
    video_id: int,
    payload: VideoProcessRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = _get_video(db, video_id)
    video.status = "processing"
    db.commit()

    background_tasks.add_task(_process_video_task, video_id, payload)

    manager.broadcast_event(
        {"event": "video_queued", "video_id": video.id, "status": video.status},
        video_id=video.id,
    )
    return {"message": "queued", "video_id": video.id}
