"""Video processing tasks backed by Celery/Redis."""

from __future__ import annotations

import logging
import math
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import cv2
import requests

from ..core.config import (
    VIDEO_PROCESS_EVERY_N_FRAMES,
    VIDEO_PROCESS_MAX_FRAMES,
    VIDEO_UPLOAD_FRAME_CROPS,
)
from ..models.database import SessionLocal
from ..models.models import BlacklistedPlate, UploadedVideo, VideoDetection
from ..services.minio_service import minio_service
from ..services.plate_format import normalize_license_plate
from ..services.roboflow_lpr_service import PlateDetection, PlateOCRService, RoboflowPlateDetector
from ..socket.manager import manager

try:
    from .celery_app import celery_app
except Exception as exc:  # pragma: no cover - only used when celery is not installed/configured
    celery_app = None
    CELERY_IMPORT_ERROR: Exception | None = exc
else:
    CELERY_IMPORT_ERROR = None

logger = logging.getLogger(__name__)


class ProcessVideoTask:
    """Runs Roboflow detection on video frames and persists live detections."""

    def run_sync(self, video_id: int) -> dict[str, Any]:
        logger.info("Starting sync video processing: video_id=%d", video_id)
        return self._process(video_id)

    def run(self, video_id: int) -> dict[str, Any]:
        logger.info("Starting Celery video processing: video_id=%d", video_id)
        return self._process(video_id)

    def _process(self, video_id: int) -> dict[str, Any]:
        db = SessionLocal()
        video_path: str | None = None
        should_delete_video = False
        detections_count = 0

        try:
            video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
            if not video:
                logger.warning("Video not found: video_id=%d", video_id)
                return {"video_id": video_id, "status": "not_found", "detections_count": 0}

            video.status = "processing"
            db.commit()
            manager.broadcast_event(
                {
                    "event": "video_processing_started",
                    "video_id": video_id,
                    "status": "processing",
                    "detections_count": 0,
                },
                video_id=video_id,
            )

            detector = RoboflowPlateDetector()
            ocr_service = PlateOCRService()
            video_path, should_delete_video = self._materialize_video(video.video_url)
            detections_count = self._process_frames(
                db=db,
                video_id=video_id,
                video_path=video_path,
                detector=detector,
                ocr_service=ocr_service,
            )

            video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
            if video:
                video.status = "done"
                db.commit()

            manager.broadcast_event(
                {
                    "event": "video_processed",
                    "video_id": video_id,
                    "status": "done",
                    "progress": 100,
                    "detections_count": detections_count,
                },
                video_id=video_id,
            )

            logger.info(
                "Video processed successfully: video_id=%d, detections=%d",
                video_id,
                detections_count,
            )
            return {"video_id": video_id, "status": "done", "detections_count": detections_count}

        except Exception as exc:
            logger.error("Video processing failed: video_id=%d, error=%s", video_id, exc, exc_info=True)
            db.rollback()
            video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
            if video:
                video.status = "failed"
                db.commit()

            manager.broadcast_event(
                {
                    "event": "video_failed",
                    "video_id": video_id,
                    "status": "failed",
                    "error": str(exc),
                    "detections_count": detections_count,
                },
                video_id=video_id,
            )
            return {"video_id": video_id, "status": "failed", "error": str(exc)}

        finally:
            db.close()
            if should_delete_video and video_path:
                try:
                    os.remove(video_path)
                except OSError:
                    pass

    def _process_frames(
        self,
        db,
        video_id: int,
        video_path: str,
        detector: RoboflowPlateDetector,
        ocr_service: PlateOCRService,
    ) -> int:
        capture = cv2.VideoCapture(video_path)
        if not capture.isOpened():
            raise RuntimeError("Cannot open uploaded video for processing")

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frame_step = VIDEO_PROCESS_EVERY_N_FRAMES
        max_processed_frames = VIDEO_PROCESS_MAX_FRAMES
        expected_steps = self._expected_steps(total_frames, frame_step, max_processed_frames)

        processed_frames = 0
        detections_count = 0
        frame_index = 0

        try:
            while processed_frames < max_processed_frames:
                ok, frame = capture.read()
                if not ok:
                    break

                if frame_index % frame_step != 0:
                    frame_index += 1
                    continue

                timestamp_seconds = (frame_index / fps) if fps > 0 else None
                frame_detections = detector.detect(frame)

                for detection_index, plate_detection in enumerate(frame_detections):
                    saved = self._save_detection(
                        db=db,
                        video_id=video_id,
                        frame=frame,
                        plate_detection=plate_detection,
                        detection_index=detection_index,
                        ocr_service=ocr_service,
                        frame_number=frame_index,
                        timestamp_seconds=timestamp_seconds,
                    )
                    if saved:
                        detections_count += 1
                        manager.broadcast_event(
                            {
                                "event": "video_detection_created",
                                "video_id": video_id,
                                "status": "processing",
                                "detection": saved,
                                "detections_count": detections_count,
                            },
                            video_id=video_id,
                        )

                processed_frames += 1
                self._broadcast_progress(
                    video_id=video_id,
                    processed_frames=processed_frames,
                    frame_number=frame_index,
                    total_frames=total_frames,
                    expected_steps=expected_steps,
                    detections_count=detections_count,
                )
                frame_index += 1
        finally:
            capture.release()

        return detections_count

    @staticmethod
    def _expected_steps(total_frames: int, frame_step: int, max_processed_frames: int) -> int | None:
        if total_frames <= 0:
            return None
        return min(max_processed_frames, max(1, math.ceil(total_frames / frame_step)))

    @staticmethod
    def _broadcast_progress(
        video_id: int,
        processed_frames: int,
        frame_number: int,
        total_frames: int,
        expected_steps: int | None,
        detections_count: int,
    ) -> None:
        progress = None
        if expected_steps:
            progress = min(99, round((processed_frames / expected_steps) * 100, 1))

        manager.broadcast_event(
            {
                "event": "video_progress",
                "video_id": video_id,
                "status": "processing",
                "processed_frames": processed_frames,
                "frame_number": frame_number,
                "total_frames": total_frames,
                "progress": progress,
                "detections_count": detections_count,
            },
            video_id=video_id,
        )

    def _save_detection(
        self,
        db,
        video_id: int,
        frame,
        plate_detection: PlateDetection,
        detection_index: int,
        ocr_service: PlateOCRService,
        frame_number: int,
        timestamp_seconds: float | None,
    ) -> dict[str, Any] | None:
        frame_height, frame_width = frame.shape[:2]
        bbox = tuple(int(value) for value in plate_detection.bbox)
        crop = self._crop_plate(frame, plate_detection.bbox)
        plate_number, ocr_confidence = ocr_service.recognize(crop)
        plate_number = self._clean_plate_number(plate_number)
        confidence = (
            round((plate_detection.confidence + ocr_confidence) / 2, 4)
            if ocr_confidence > 0
            else round(plate_detection.confidence, 4)
        )
        image_url = self._upload_crop(
            video_id=video_id,
            frame_number=frame_number,
            detection_index=detection_index,
            crop=crop,
        )
        is_blacklisted = self._is_blacklisted(db, plate_number)

        detection = VideoDetection(
            uploaded_video_id=video_id,
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            frame_number=frame_number,
            timestamp_seconds=timestamp_seconds,
            bbox_x1=bbox[0],
            bbox_y1=bbox[1],
            bbox_x2=bbox[2],
            bbox_y2=bbox[3],
            frame_width=frame_width,
            frame_height=frame_height,
            is_blacklisted=is_blacklisted,
        )
        db.add(detection)
        db.commit()
        db.refresh(detection)
        return self._serialize_detection(detection)

    @staticmethod
    def _crop_plate(frame, bbox: tuple[int, int, int, int]):
        x1, y1, x2, y2 = bbox
        width = x2 - x1
        height = y2 - y1
        pad_x = int(width * 0.08)
        pad_y = int(height * 0.08)
        frame_height, frame_width = frame.shape[:2]
        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(frame_width, x2 + pad_x)
        y2 = min(frame_height, y2 + pad_y)
        return frame[y1:y2, x1:x2]

    @staticmethod
    def _clean_plate_number(plate_number: str) -> str:
        return normalize_license_plate(plate_number)

    @staticmethod
    def _is_blacklisted(db, plate_number: str) -> bool:
        if plate_number == "UNKNOWN":
            return False
        return (
            db.query(BlacklistedPlate)
            .filter(BlacklistedPlate.plate_number == plate_number)
            .first()
            is not None
        )

    @staticmethod
    def _upload_crop(
        video_id: int,
        frame_number: int,
        detection_index: int,
        crop,
    ) -> str | None:
        if not VIDEO_UPLOAD_FRAME_CROPS or crop.size == 0:
            return None

        try:
            ok, encoded = cv2.imencode(".jpg", crop)
            if not ok:
                return None
            return minio_service.upload_bytes(
                encoded.tobytes(),
                filename=f"video_{video_id}_frame_{frame_number}_{detection_index}.jpg",
                content_type="image/jpeg",
            )
        except Exception as exc:
            logger.debug("Failed to upload video crop: %s", exc)
            return None

    @staticmethod
    def _serialize_detection(detection: VideoDetection) -> dict[str, Any]:
        return {
            "id": detection.id,
            "uploaded_video_id": detection.uploaded_video_id,
            "plate_number": detection.plate_number,
            "confidence": detection.confidence,
            "image_url": detection.image_url,
            "frame_number": detection.frame_number,
            "timestamp_seconds": detection.timestamp_seconds,
            "bbox": detection.bbox,
            "frame_width": detection.frame_width,
            "frame_height": detection.frame_height,
            "is_blacklisted": detection.is_blacklisted,
            "created_at": detection.created_at.isoformat() if detection.created_at else None,
        }

    def _materialize_video(self, video_url: str) -> tuple[str, bool]:
        parsed = urlparse(video_url)
        if parsed.scheme in {"", "file"}:
            path = Path(parsed.path if parsed.scheme == "file" else video_url)
            if path.exists():
                return str(path), False

        suffix = Path(parsed.path).suffix or ".mp4"
        fd, temp_path = tempfile.mkstemp(prefix="lpr_video_", suffix=suffix)
        os.close(fd)

        with requests.get(video_url, stream=True, timeout=(10, 120)) as response:
            response.raise_for_status()
            with open(temp_path, "wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        file.write(chunk)

        return temp_path, True


process_video_task = ProcessVideoTask()


if celery_app is not None:

    @celery_app.task(name="src.backend.tasks.video_tasks.process_video", bind=True)
    def process_video_celery_task(self, video_id: int) -> dict[str, Any]:
        return process_video_task.run(video_id)

else:
    process_video_celery_task = None


def enqueue_video_processing(video_id: int) -> str:
    if process_video_celery_task is None:
        raise RuntimeError(f"Celery is unavailable: {CELERY_IMPORT_ERROR}")
    async_result = process_video_celery_task.delay(video_id)
    return async_result.id
