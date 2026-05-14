"""
Video processing tasks.
Runs video processing through Celery, with a synchronous entrypoint for tests/tools.
"""

import base64
import logging
import os
import time

import cv2

from ..core.config import (
    VIDEO_DETECT_CONFIDENCE,
    VIDEO_OCR_CONFIDENCE,
    VIDEO_PROCESS_EVERY_N_FRAMES,
    VIDEO_PROCESS_MAX_FRAMES,
    VIDEO_STREAM_TARGET_FPS,
    VIDEO_STREAM_JPEG_QUALITY,
    VIDEO_STREAM_MAX_WIDTH,
)
from ..models.database import SessionLocal
from ..models.models import BlacklistedPlate, UploadedVideo, VideoDetection
from ..services.minio_service import minio_service
from ..socket.manager import manager
from .celery_app import celery_app

logger = logging.getLogger(__name__)


class ProcessVideoTask:
    """
    Encapsulates video processing logic.
    Designed to work both as a Celery task and as a synchronous callable.
    """

    def run_sync(self, video_id: int) -> None:
        """Run video processing synchronously."""
        logger.info("Starting sync video processing: video_id=%d", video_id)
        self._process(video_id, publish_events=False)

    def run(self, video_id: int) -> None:
        """Run video processing (called by Celery)."""
        logger.info("Starting Celery video processing: video_id=%d", video_id)
        self._process(video_id, publish_events=True)

    def _process(self, video_id: int, publish_events: bool = False) -> None:
        """Core processing logic."""
        from ..services.lpr_service import lpr_service

        db = SessionLocal()
        temp_video_path = None
        cap = None
        try:
            video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
            if not video:
                logger.warning("Video not found: video_id=%d", video_id)
                return

            video.status = "processing"
            db.commit()
            self._emit_event(
                {"event": "video_processing_started", "video_id": video_id, "status": video.status},
                video_id=video_id,
                publish=publish_events,
            )

            if not lpr_service.is_ready():
                raise RuntimeError("LPR ONNX models are not loaded")

            temp_video_path = minio_service.download_url_to_temp_file(video.video_url)
            cap = cv2.VideoCapture(temp_video_path)
            if not cap.isOpened():
                raise RuntimeError("Cannot open uploaded video for processing")

            fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
            if fps <= 0:
                fps = float(VIDEO_STREAM_TARGET_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            every_n_frames = max(1, VIDEO_PROCESS_EVERY_N_FRAMES)
            max_processed_frames = max(0, VIDEO_PROCESS_MAX_FRAMES)
            processed_frames = 0
            frame_number = 0
            seen_plate_numbers: set[str] = set()
            frame_interval = 1.0 / fps if fps > 0 else 0.0
            next_frame_due = time.monotonic()

            logger.info(
                "Processing video_id=%d, fps=%.2f, total_frames=%d, every_n_frames=%d",
                video_id,
                fps,
                total_frames,
                every_n_frames,
            )

            while True:
                if frame_interval > 0:
                    now = time.monotonic()
                    lag = now - next_frame_due
                    if lag < 0:
                        time.sleep(-lag)
                        lag = 0.0
                    if lag >= frame_interval:
                        frames_to_skip = int(lag / frame_interval)
                        ok = True
                        for _ in range(frames_to_skip):
                            ok = cap.grab()
                            if not ok:
                                break
                            frame_number += 1
                        if not ok:
                            break
                        next_frame_due += (frames_to_skip + 1) * frame_interval
                    else:
                        next_frame_due += frame_interval
                ok, frame = cap.read()
                if not ok:
                    break

                frame_number += 1
                if frame_number % every_n_frames != 0:
                    continue
                if max_processed_frames and processed_frames >= max_processed_frames:
                    break

                timestamp_seconds = frame_number / fps if fps else None
                result = lpr_service.predict_frame(frame)
                plates = self._filter_video_plates(result.get("plates", []))

                for plate in plates:
                    plate_number = (plate.get("plate_number") or "").strip()
                    if not plate_number or plate_number in seen_plate_numbers:
                        continue

                    seen_plate_numbers.add(plate_number)
                    is_blacklisted = self._is_blacklisted(db, plate_number)
                    detection = VideoDetection(
                        uploaded_video_id=video_id,
                        plate_number=plate_number,
                        confidence=float(plate.get("confidence", 0.0)),
                        image_url=None,
                        frame_number=frame_number,
                        timestamp_seconds=timestamp_seconds,
                        is_blacklisted=is_blacklisted,
                    )
                    db.add(detection)
                    db.commit()
                    db.refresh(detection)

                    self._emit_event(
                        {
                            "event": "video_detection_created",
                            "video_id": video_id,
                            "detection_id": detection.id,
                            "plate_number": plate_number,
                            "confidence": detection.confidence,
                            "frame_number": frame_number,
                            "timestamp_seconds": timestamp_seconds,
                            "is_blacklisted": is_blacklisted,
                        },
                        video_id=video_id,
                        publish=publish_events,
                    )

                annotated_frame = self._draw_detections(frame, plates)
                frame_data = self._encode_frame(annotated_frame)
                progress = frame_number / total_frames if total_frames > 0 else None

                self._emit_event(
                    {
                        "event": "video_frame",
                        "video_id": video_id,
                        "status": "processing",
                        "frame_number": frame_number,
                        "timestamp_seconds": timestamp_seconds,
                        "progress": progress,
                        "frame": frame_data,
                        "detections": [
                            {
                                "plate_number": plate.get("plate_number") or "",
                                "confidence": plate.get("confidence", 0.0),
                                "detect_confidence": plate.get("detect_confidence", 0.0),
                                "ocr_confidence": plate.get("ocr_confidence", 0.0),
                                "bbox": plate.get("bbox", []),
                            }
                            for plate in plates
                        ],
                    },
                    video_id=video_id,
                    publish=publish_events,
                )
                processed_frames += 1

            video.status = "done"
            db.commit()
            detections_count = (
                db.query(VideoDetection)
                .filter(VideoDetection.uploaded_video_id == video_id)
                .count()
            )

            self._emit_event(
                {
                    "event": "video_processed",
                    "video_id": video_id,
                    "status": video.status,
                    "detections_count": detections_count,
                },
                video_id=video_id,
                publish=publish_events,
            )

            logger.info(
                "Video processed successfully: video_id=%d, detections=%d, processed_frames=%d",
                video_id,
                detections_count,
                processed_frames,
            )
        except Exception as e:
            logger.error("Video processing failed: video_id=%d, error=%s", video_id, e)
            db.rollback()
            try:
                video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
                if video:
                    video.status = "failed"
                    db.commit()
            except Exception:
                db.rollback()
            self._emit_event(
                {
                    "event": "video_failed",
                    "video_id": video_id,
                    "status": "failed",
                    "error": str(e),
                },
                video_id=video_id,
                publish=publish_events,
            )
        finally:
            if cap is not None:
                cap.release()
            if temp_video_path:
                try:
                    os.unlink(temp_video_path)
                except OSError:
                    logger.warning("Could not remove temp video: %s", temp_video_path)
            db.close()

    @staticmethod
    def _emit_event(payload: dict, video_id: int | None = None, publish: bool = False) -> None:
        manager.broadcast_event(payload, video_id=video_id, publish=publish)

    @staticmethod
    def _filter_video_plates(plates: list[dict]) -> list[dict]:
        filtered = []
        for plate in plates:
            detect_conf = float(plate.get("detect_confidence", plate.get("confidence", 0.0)) or 0.0)
            ocr_conf = float(plate.get("ocr_confidence", 0.0) or 0.0)
            if detect_conf < VIDEO_DETECT_CONFIDENCE:
                continue
            if plate.get("plate_number") and ocr_conf < VIDEO_OCR_CONFIDENCE:
                continue
            filtered.append(plate)
        return filtered

    @staticmethod
    def _is_blacklisted(db, plate_number: str) -> bool:
        return (
            db.query(BlacklistedPlate)
            .filter(BlacklistedPlate.plate_number == plate_number)
            .first()
            is not None
        )

    @staticmethod
    def _draw_detections(frame, plates: list[dict]):
        annotated = frame.copy()
        for plate in plates:
            bbox = plate.get("bbox") or []
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = [int(value) for value in bbox]
            label = plate.get("plate_number") or "plate"
            confidence = float(plate.get("confidence", 0.0) or 0.0)
            color = (0, 255, 120)

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            text = f"{label} {confidence:.2f}"
            text_size, _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            text_w, text_h = text_size
            text_y = max(0, y1 - text_h - 8)
            cv2.rectangle(
                annotated,
                (x1, text_y),
                (x1 + text_w + 8, text_y + text_h + 8),
                color,
                -1,
            )
            cv2.putText(
                annotated,
                text,
                (x1 + 4, text_y + text_h + 3),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 0, 0),
                2,
                cv2.LINE_AA,
            )
        return annotated

    @staticmethod
    def _encode_frame(frame) -> str | None:
        height, width = frame.shape[:2]
        if width > VIDEO_STREAM_MAX_WIDTH:
            scale = VIDEO_STREAM_MAX_WIDTH / width
            frame = cv2.resize(
                frame,
                (VIDEO_STREAM_MAX_WIDTH, max(1, int(height * scale))),
                interpolation=cv2.INTER_AREA,
            )

        quality = min(95, max(35, VIDEO_STREAM_JPEG_QUALITY))
        ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if not ok:
            return None
        encoded = base64.b64encode(buffer).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"


# Singleton instance for both sync and async use
process_video_task = ProcessVideoTask()


@celery_app.task(name="src.backend.tasks.video_tasks.process_video")
def process_video_celery_task(video_id: int) -> None:
    process_video_task.run(video_id)
