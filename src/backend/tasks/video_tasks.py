"""Video processing tasks backed by Celery/Redis."""

from __future__ import annotations

import logging
import math
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import cv2
import requests

from ..core.config import (
    MINIO_BUCKET,
    VIDEO_FLUSH_MIN_OCR_CONFIDENCE,
    VIDEO_PROCESS_EVERY_N_FRAMES,
    VIDEO_PROCESS_MAX_FRAMES,
    VIDEO_PROCESS_SYNC_FALLBACK,
    VIDEO_STABLE_MIN_OCR_CONFIDENCE,
    VIDEO_STABLE_MIN_VOTES,
    VIDEO_TRACK_IOU_THRESHOLD,
    VIDEO_UPLOAD_FRAME_CROPS,
)
from ..models.database import SessionLocal
from ..models.models import BlacklistedPlate, UploadedVideo, VideoDetection
from ..services.minio_service import minio_service
from ..services.plate_format import normalize_license_plate_compact
from ..services.video_lpr_service import (
    LocalOnnxPlateDetector,
    PlateDetection,
    PlateOCRService,
    get_video_detector,
    get_video_ocr_service,
)
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
    """Runs local ONNX detection on video frames and persists live detections."""

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

            detector = get_video_detector()
            ocr_service = get_video_ocr_service()
            video_path, should_delete_video = self._materialize_video(video.video_url)
            detections_count, processed_video_url = self._process_frames(
                db=db,
                video_id=video_id,
                video_path=video_path,
                detector=detector,
                ocr_service=ocr_service,
            )
            if not processed_video_url:
                raise RuntimeError("Processed video was created but upload failed")

            video = db.query(UploadedVideo).filter(UploadedVideo.id == video_id).first()
            if video:
                video.status = "done"
                video.processed_video_url = processed_video_url
                db.commit()

            manager.broadcast_event(
                {
                    "event": "video_processed",
                    "video_id": video_id,
                    "status": "done",
                    "progress": 100,
                    "detections_count": detections_count,
                    "processed_video_url": processed_video_url,
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
        detector: LocalOnnxPlateDetector,
        ocr_service: PlateOCRService,
    ) -> tuple[int, str | None]:
        capture = cv2.VideoCapture(video_path)
        if not capture.isOpened():
            raise RuntimeError("Cannot open uploaded video for processing")

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        frame_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if frame_width <= 0 or frame_height <= 0:
            raise RuntimeError("Cannot read uploaded video dimensions")

        frame_step = VIDEO_PROCESS_EVERY_N_FRAMES
        max_processed_frames = VIDEO_PROCESS_MAX_FRAMES
        expected_steps = self._expected_steps(total_frames, frame_step, max_processed_frames)
        output_path = self._make_temp_output_path()
        writer = self._create_video_writer(
            output_path=output_path,
            fps=fps or 25.0,
            frame_width=frame_width,
            frame_height=frame_height,
        )

        processed_frames = 0
        detections_count = 0
        frame_index = 0
        active_overlays: list[dict[str, Any]] = []
        overlay_ttl_frames = max(1, int((fps or 25.0) * 0.8))
        persisted_plate_keys: set[str] = set()
        blacklist_keys = self._load_blacklist_keys(db)
        active_tracks: list[dict[str, Any]] = []
        next_track_id = 1
        track_stale_frames = max(frame_step * 6, int((fps or 25.0) * 2))

        try:
            while processed_frames < max_processed_frames:
                ok, frame = capture.read()
                if not ok:
                    break

                should_process = frame_index % frame_step == 0
                if should_process:
                    timestamp_seconds = (frame_index / fps) if fps > 0 else None
                    frame_detections = detector.detect(frame)
                    active_overlays = []
                    stale_tracks = self._pop_stale_tracks(
                        active_tracks,
                        frame_index,
                        track_stale_frames,
                    )
                    if stale_tracks:
                        detections_count = self._flush_pending_tracks(
                            db=db,
                            video_id=video_id,
                            active_tracks=stale_tracks,
                            persisted_plate_keys=persisted_plate_keys,
                            detections_count=detections_count,
                        )
                    matched_track_ids: set[int] = set()

                    for detection_index, plate_detection in enumerate(frame_detections):
                        track = self._match_track(
                            active_tracks,
                            plate_detection.bbox,
                            matched_track_ids,
                        )
                        if track is None:
                            track = self._create_track(
                                track_id=next_track_id,
                                bbox=plate_detection.bbox,
                                frame_number=frame_index,
                            )
                            next_track_id += 1
                            active_tracks.append(track)
                        else:
                            self._touch_track(track, plate_detection.bbox, frame_index)
                        matched_track_ids.add(track["id"])

                        stable_key = track.get("stable_key")
                        if stable_key and stable_key in persisted_plate_keys:
                            detection_data = self._build_tracked_overlay_data(
                                video_id=video_id,
                                frame=frame,
                                plate_detection=plate_detection,
                                detection_index=detection_index,
                                track=track,
                                frame_number=frame_index,
                                timestamp_seconds=timestamp_seconds,
                            )
                        else:
                            detection_data = self._build_detection_data(
                                blacklist_keys=blacklist_keys,
                                video_id=video_id,
                                frame=frame,
                                plate_detection=plate_detection,
                                detection_index=detection_index,
                                ocr_service=ocr_service,
                                frame_number=frame_index,
                                timestamp_seconds=timestamp_seconds,
                            )
                            candidate = self._update_track_candidate(track, detection_data)
                            if candidate is not None:
                                stable_key = candidate["plate_key"]
                                track["stable_key"] = stable_key
                                track["stable_plate_number"] = candidate["plate_number"]
                                track["stable_confidence"] = candidate["avg_confidence"]
                                track["best_data"] = candidate["best_data"]
                                detection_data["plate_number"] = candidate["plate_number"]
                                detection_data["confidence"] = candidate["avg_confidence"]
                                detection_data["is_blacklisted"] = candidate["best_data"].get(
                                    "is_blacklisted",
                                    False,
                                )

                                if stable_key not in persisted_plate_keys:
                                    saved = self._persist_detection(db, candidate["best_data"])
                                    persisted_plate_keys.add(stable_key)
                                    detections_count += 1
                                    self._broadcast_detection_created(
                                        video_id=video_id,
                                        saved=saved,
                                        detections_count=detections_count,
                                    )

                        active_overlays.append(
                            {
                                **detection_data,
                                "last_seen_frame": frame_index,
                            }
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

                active_overlays = [
                    overlay
                    for overlay in active_overlays
                    if frame_index - overlay["last_seen_frame"] <= overlay_ttl_frames
                ]
                self._draw_overlays(frame, active_overlays)
                writer.write(frame)
                frame_index += 1

            detections_count = self._flush_pending_tracks(
                db=db,
                video_id=video_id,
                active_tracks=active_tracks,
                persisted_plate_keys=persisted_plate_keys,
                detections_count=detections_count,
            )
        finally:
            capture.release()
            writer.release()

        processed_video_url = self._upload_processed_video(video_id, output_path)
        try:
            os.remove(output_path)
        except OSError:
            pass

        return detections_count, processed_video_url

    @staticmethod
    def _make_temp_output_path() -> str:
        fd, temp_path = tempfile.mkstemp(prefix="lpr_processed_", suffix=".webm")
        os.close(fd)
        os.remove(temp_path)
        return temp_path

    @staticmethod
    def _create_video_writer(
        output_path: str,
        fps: float,
        frame_width: int,
        frame_height: int,
    ) -> cv2.VideoWriter:
        writer = cv2.VideoWriter(
            output_path,
            cv2.VideoWriter_fourcc(*"VP80"),
            fps,
            (frame_width, frame_height),
        )
        if not writer.isOpened():
            raise RuntimeError("Cannot create processed WebM video writer")
        return writer

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

    @staticmethod
    def _broadcast_detection_created(
        video_id: int,
        saved: dict[str, Any],
        detections_count: int,
    ) -> None:
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

    @staticmethod
    def _create_track(
        track_id: int,
        bbox: tuple[int, int, int, int],
        frame_number: int,
    ) -> dict[str, Any]:
        return {
            "id": track_id,
            "bbox": tuple(int(value) for value in bbox),
            "last_seen_frame": frame_number,
            "votes": {},
            "best_data": None,
            "stable_key": None,
            "stable_plate_number": None,
            "stable_confidence": 0.0,
        }

    @staticmethod
    def _touch_track(
        track: dict[str, Any],
        bbox: tuple[int, int, int, int],
        frame_number: int,
    ) -> None:
        track["bbox"] = tuple(int(value) for value in bbox)
        track["last_seen_frame"] = frame_number

    @staticmethod
    def _pop_stale_tracks(
        active_tracks: list[dict[str, Any]],
        frame_number: int,
        max_stale_frames: int,
    ) -> list[dict[str, Any]]:
        stale_tracks = []
        fresh_tracks = []
        for track in active_tracks:
            is_stale = (
                frame_number - int(track.get("last_seen_frame", frame_number))
                > max_stale_frames
            )
            if is_stale:
                stale_tracks.append(track)
            else:
                fresh_tracks.append(track)
        active_tracks[:] = fresh_tracks
        return stale_tracks

    def _match_track(
        self,
        active_tracks: list[dict[str, Any]],
        bbox: tuple[int, int, int, int],
        matched_track_ids: set[int],
    ) -> dict[str, Any] | None:
        best_track = None
        best_iou = 0.0
        for track in active_tracks:
            if track["id"] in matched_track_ids:
                continue
            iou = self._bbox_iou(tuple(track["bbox"]), bbox)
            if iou > best_iou:
                best_iou = iou
                best_track = track

        if best_iou < VIDEO_TRACK_IOU_THRESHOLD:
            return None
        return best_track

    @staticmethod
    def _bbox_iou(
        first: tuple[int, int, int, int],
        second: tuple[int, int, int, int],
    ) -> float:
        ax1, ay1, ax2, ay2 = first
        bx1, by1, bx2, by2 = second
        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)
        inter_width = max(0, inter_x2 - inter_x1)
        inter_height = max(0, inter_y2 - inter_y1)
        intersection = inter_width * inter_height
        if intersection <= 0:
            return 0.0

        first_area = max(0, ax2 - ax1) * max(0, ay2 - ay1)
        second_area = max(0, bx2 - bx1) * max(0, by2 - by1)
        union = first_area + second_area - intersection
        return intersection / union if union > 0 else 0.0

    def _update_track_candidate(
        self,
        track: dict[str, Any],
        detection_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        plate_key = self._plate_cache_key(detection_data["plate_number"])
        if not plate_key:
            return self._stable_track_candidate(track)

        votes = track.setdefault("votes", {})
        candidate = votes.setdefault(
            plate_key,
            {
                "plate_key": plate_key,
                "plate_number": detection_data["plate_number"],
                "count": 0,
                "confidence_sum": 0.0,
                "ocr_confidence_sum": 0.0,
                "best_confidence": -1.0,
                "best_data": detection_data,
                "avg_confidence": 0.0,
                "avg_ocr_confidence": 0.0,
                "quality": 0,
            },
        )

        confidence = float(detection_data.get("confidence") or 0.0)
        ocr_confidence = float(detection_data.get("_ocr_confidence") or 0.0)
        candidate["count"] += 1
        candidate["confidence_sum"] += confidence
        candidate["ocr_confidence_sum"] += ocr_confidence
        candidate["avg_confidence"] = round(
            candidate["confidence_sum"] / candidate["count"],
            4,
        )
        candidate["avg_ocr_confidence"] = round(
            candidate["ocr_confidence_sum"] / candidate["count"],
            4,
        )
        candidate["plate_number"] = detection_data["plate_number"]
        candidate["quality"] = self._plate_quality_score(detection_data["plate_number"])

        if confidence > candidate["best_confidence"]:
            candidate["best_confidence"] = confidence
            candidate["best_data"] = detection_data

        track["best_data"] = self._best_track_candidate(track)["best_data"]
        return self._stable_track_candidate(track)

    @staticmethod
    def _best_track_candidate(track: dict[str, Any]) -> dict[str, Any] | None:
        votes = track.get("votes") or {}
        if not votes:
            return None
        return max(
            votes.values(),
            key=lambda candidate: (
                candidate["count"],
                candidate["quality"],
                candidate["avg_ocr_confidence"],
                candidate["avg_confidence"],
            ),
        )

    @staticmethod
    def _plate_quality_score(plate_number: str) -> int:
        key = ProcessVideoTask._plate_cache_key(plate_number)
        if not key:
            return 0

        score = 1
        if len(key) in {8, 9}:
            score += 2
        elif len(key) >= 7:
            score += 1
        if len(key) >= 3 and key[:2].isdigit() and key[2].isalpha():
            score += 1
        if any(char.isdigit() for char in key) and any(char.isalpha() for char in key):
            score += 1
        return score

    def _stable_track_candidate(self, track: dict[str, Any]) -> dict[str, Any] | None:
        candidate = self._best_track_candidate(track)
        if candidate is None:
            return None
        if (
            candidate["count"] >= VIDEO_STABLE_MIN_VOTES
            and candidate["avg_ocr_confidence"] >= VIDEO_STABLE_MIN_OCR_CONFIDENCE
        ):
            return candidate
        return None

    def _flush_pending_tracks(
        self,
        db,
        video_id: int,
        active_tracks: list[dict[str, Any]],
        persisted_plate_keys: set[str],
        detections_count: int,
    ) -> int:
        for track in active_tracks:
            candidate = self._best_track_candidate(track)
            if candidate is None or candidate["plate_key"] in persisted_plate_keys:
                continue
            if (
                candidate["count"] < VIDEO_STABLE_MIN_VOTES
                and candidate["avg_ocr_confidence"] < VIDEO_FLUSH_MIN_OCR_CONFIDENCE
            ):
                continue

            saved = self._persist_detection(db, candidate["best_data"])
            persisted_plate_keys.add(candidate["plate_key"])
            detections_count += 1
            self._broadcast_detection_created(
                video_id=video_id,
                saved=saved,
                detections_count=detections_count,
            )

        return detections_count

    @staticmethod
    def _build_tracked_overlay_data(
        video_id: int,
        frame,
        plate_detection: PlateDetection,
        detection_index: int,
        track: dict[str, Any],
        frame_number: int,
        timestamp_seconds: float | None,
    ) -> dict[str, Any]:
        frame_height, frame_width = frame.shape[:2]
        bbox = tuple(int(value) for value in plate_detection.bbox)
        best_data = track.get("best_data") or {}
        plate_number = (
            track.get("stable_plate_number")
            or best_data.get("plate_number")
            or "UNKNOWN"
        )
        confidence = float(
            track.get("stable_confidence")
            or best_data.get("confidence")
            or plate_detection.confidence
        )

        return {
            "uploaded_video_id": video_id,
            "plate_number": plate_number,
            "confidence": round(confidence, 4),
            "image_url": None,
            "frame_number": frame_number,
            "timestamp_seconds": timestamp_seconds,
            "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
            "frame_width": frame_width,
            "frame_height": frame_height,
            "is_blacklisted": bool(best_data.get("is_blacklisted", False)),
            "_crop": None,
            "_detection_index": detection_index,
            "_detect_confidence": round(float(plate_detection.confidence), 4),
            "_ocr_confidence": 0.0,
            "_track_id": track["id"],
            "_ocr_skipped": True,
        }

    def _build_detection_data(
        self,
        blacklist_keys: set[str],
        video_id: int,
        frame,
        plate_detection: PlateDetection,
        detection_index: int,
        ocr_service: PlateOCRService,
        frame_number: int,
        timestamp_seconds: float | None,
    ) -> dict[str, Any]:
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
        is_blacklisted = self._is_blacklisted(blacklist_keys, plate_number)
        return {
            "uploaded_video_id": video_id,
            "plate_number": plate_number,
            "confidence": confidence,
            "image_url": None,
            "frame_number": frame_number,
            "timestamp_seconds": timestamp_seconds,
            "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
            "frame_width": frame_width,
            "frame_height": frame_height,
            "is_blacklisted": is_blacklisted,
            "_crop": crop,
            "_detection_index": detection_index,
            "_detect_confidence": round(float(plate_detection.confidence), 4),
            "_ocr_confidence": round(float(ocr_confidence), 4),
        }

    @staticmethod
    def _persist_detection(db, detection_data: dict[str, Any]) -> dict[str, Any]:
        image_url = detection_data["image_url"]
        crop = detection_data.get("_crop")
        if image_url is None and crop is not None:
            image_url = ProcessVideoTask._upload_crop(
                video_id=detection_data["uploaded_video_id"],
                frame_number=detection_data["frame_number"],
                detection_index=detection_data.get("_detection_index", 0),
                crop=crop,
            )

        detection = VideoDetection(
            uploaded_video_id=detection_data["uploaded_video_id"],
            plate_number=detection_data["plate_number"],
            confidence=detection_data["confidence"],
            image_url=image_url,
            frame_number=detection_data["frame_number"],
            timestamp_seconds=detection_data["timestamp_seconds"],
            bbox_x1=detection_data["bbox"][0],
            bbox_y1=detection_data["bbox"][1],
            bbox_x2=detection_data["bbox"][2],
            bbox_y2=detection_data["bbox"][3],
            frame_width=detection_data["frame_width"],
            frame_height=detection_data["frame_height"],
            is_blacklisted=detection_data["is_blacklisted"],
        )
        db.add(detection)
        db.commit()
        db.refresh(detection)
        return ProcessVideoTask._serialize_detection(detection)

    @staticmethod
    def _plate_cache_key(plate_number: str) -> str:
        if not plate_number or plate_number == "UNKNOWN":
            return ""
        return "".join(char for char in plate_number.upper() if char.isalnum())

    @staticmethod
    def _draw_overlays(frame, overlays: list[dict[str, Any]]) -> None:
        for overlay in overlays:
            x1, y1, x2, y2 = overlay["bbox"]
            is_blacklisted = bool(overlay.get("is_blacklisted"))
            color = (0, 0, 255) if is_blacklisted else (20, 220, 90)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)

            plate_number = overlay.get("plate_number") or "UNKNOWN"
            label = plate_number if plate_number != "UNKNOWN" else "PLATE"

            (text_width, text_height), baseline = cv2.getTextSize(
                label,
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                2,
            )
            label_y = max(0, y1 - text_height - baseline - 6)
            cv2.rectangle(
                frame,
                (x1, label_y),
                (x1 + text_width + 10, label_y + text_height + baseline + 8),
                color,
                -1,
            )
            cv2.putText(
                frame,
                label,
                (x1 + 5, label_y + text_height + 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

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
        return normalize_license_plate_compact(plate_number)

    @staticmethod
    def _load_blacklist_keys(db) -> set[str]:
        keys: set[str] = set()
        for (plate_number,) in db.query(BlacklistedPlate.plate_number).all():
            key = ProcessVideoTask._plate_cache_key(plate_number)
            if key:
                keys.add(key)
        return keys

    @staticmethod
    def _is_blacklisted(blacklist_keys: set[str], plate_number: str) -> bool:
        if plate_number == "UNKNOWN":
            return False
        return ProcessVideoTask._plate_cache_key(plate_number) in blacklist_keys

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
    def _upload_processed_video(video_id: int, output_path: str) -> str | None:
        mp4_path = ProcessVideoTask._transcode_to_mp4(output_path)
        upload_path = mp4_path or output_path
        filename = f"video_{video_id}_processed.mp4" if mp4_path else f"video_{video_id}_processed.webm"
        content_type = "video/mp4" if mp4_path else "video/webm"

        try:
            with open(upload_path, "rb") as file:
                data = file.read()
            if not data:
                return None
            return minio_service.upload_bytes(
                data,
                filename=filename,
                content_type=content_type,
                prefix="processed-videos",
            )
        except Exception as exc:
            logger.warning("Failed to upload processed video: %s", exc, exc_info=True)
            return None
        finally:
            if mp4_path:
                try:
                    os.remove(mp4_path)
                except OSError:
                    pass

    @staticmethod
    def _transcode_to_mp4(output_path: str) -> str | None:
        fd, mp4_path = tempfile.mkstemp(prefix="lpr_processed_", suffix=".mp4")
        os.close(fd)
        os.remove(mp4_path)

        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            output_path,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            mp4_path,
        ]

        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            if os.path.getsize(mp4_path) > 0:
                return mp4_path
        except Exception as exc:
            logger.warning("Failed to transcode processed video to MP4: %s", exc)

        try:
            os.remove(mp4_path)
        except OSError:
            pass
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

        object_name = minio_service.object_name_from_url(video_url)
        if object_name:
            response = minio_service.client.get_object(MINIO_BUCKET, object_name)
            try:
                with open(temp_path, "wb") as file:
                    for chunk in response.stream(1024 * 1024):
                        if chunk:
                            file.write(chunk)
                return temp_path, True
            finally:
                response.close()
                response.release_conn()

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


def enqueue_video_processing(video_id: int) -> str | None:
    """
    Enqueue a video for processing.
    Returns task_id if Celery is available. Synchronous fallback is disabled by
    default because full video inference is too heavy for the web request path.
    """
    if process_video_celery_task is not None:
        try:
            async_result = process_video_celery_task.delay(video_id)
            return async_result.id
        except Exception as exc:
            if not VIDEO_PROCESS_SYNC_FALLBACK:
                raise RuntimeError(f"Celery task failed: {exc}") from exc
            logger.warning("Celery task failed, falling back to sync processing: %s", exc)

    elif not VIDEO_PROCESS_SYNC_FALLBACK:
        raise RuntimeError(f"Celery is unavailable: {CELERY_IMPORT_ERROR}")

    logger.info("Processing video synchronously (Celery unavailable): video_id=%d", video_id)
    process_video_task.run_sync(video_id)
    return None
