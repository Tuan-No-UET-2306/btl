"""Video LPR helpers backed by local ONNX models."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch

from ..core.config import (
    VIDEO_DETECT_CONFIDENCE,
    VIDEO_DETECT_IMAGE_SIZE,
    VIDEO_DETECT_MODEL_PATH,
    VIDEO_OCR_CONFIDENCE,
    VIDEO_OCR_IMAGE_SIZE,
    VIDEO_OCR_MODEL_PATH,
)
from .plate_format import normalize_license_plate

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = PROJECT_ROOT / "src"
YOLOV5_DIR = SRC_DIR / "yolov5"


@dataclass(frozen=True)
class PlateDetection:
    bbox: tuple[int, int, int, int]
    confidence: float
    label: str
    raw: dict[str, Any]


def _resolve_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def _select_onnx_device() -> str:
    if not torch.cuda.is_available():
        return "cpu"

    try:
        import onnxruntime
    except ImportError:
        return "cpu"

    # Force CPU for now due to inconsistent CUDA availability in worker environment
    return "cpu"


class LocalOnnxPlateDetector:
    """Runs the local LP_detector_nano_61.onnx model and normalizes plate predictions."""

    def __init__(self) -> None:
        self.model = None
        self.device = _select_onnx_device()
        self.min_confidence = VIDEO_DETECT_CONFIDENCE
        self._lock = threading.RLock()
        self._ready = False
        self._load_model()

    def is_ready(self) -> bool:
        return self._ready

    def _load_model(self) -> None:
        detector_path = _resolve_path(VIDEO_DETECT_MODEL_PATH)
        if not detector_path.exists():
            raise RuntimeError(f"Video detector model not found at {detector_path}")
        if not YOLOV5_DIR.exists():
            raise RuntimeError(f"YOLOv5 source not found at {YOLOV5_DIR}")

        self.model = torch.hub.load(
            str(YOLOV5_DIR),
            "custom",
            path=str(detector_path),
            source="local",
            force_reload=False,
            device=self.device,
        )
        self.model.conf = self.min_confidence
        self.model.iou = 0.45
        self.model.max_det = 8
        self._ready = True
        logger.info("Video detector loaded from %s", detector_path)

    def detect(self, frame_bgr: np.ndarray) -> list[PlateDetection]:
        if not self._ready or self.model is None or frame_bgr.size == 0:
            return []

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        try:
            with self._lock, torch.no_grad():
                result = self.model(frame_rgb, size=VIDEO_DETECT_IMAGE_SIZE)
            det_df = result.pandas().xyxy[0]
        except Exception as exc:
            logger.debug("Local ONNX video detector failed: %s", exc, exc_info=True)
            return []

        height, width = frame_bgr.shape[:2]
        detections: list[PlateDetection] = []
        for _, row in det_df.iterrows():
            prediction = {
                "xmin": row["xmin"],
                "ymin": row["ymin"],
                "xmax": row["xmax"],
                "ymax": row["ymax"],
                "confidence": row["confidence"],
                "name": row.get("name", "plate"),
            }
            detection = self._to_plate_detection(prediction, width=width, height=height)
            if detection and detection.confidence >= self.min_confidence:
                detections.append(detection)

        detections.sort(key=lambda item: item.confidence, reverse=True)
        return detections

    @staticmethod
    def _confidence(prediction: dict[str, Any]) -> float:
        for key in ("confidence", "score", "conf"):
            value = prediction.get(key)
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    return 0.0
        return 1.0

    @staticmethod
    def _label(prediction: dict[str, Any]) -> str:
        for key in ("class", "class_name", "label", "name"):
            value = prediction.get(key)
            if value:
                return str(value)
        return "plate"

    def _to_plate_detection(
        self,
        prediction: dict[str, Any],
        width: int,
        height: int,
    ) -> PlateDetection | None:
        bbox = self._extract_bbox(prediction)
        if bbox is None:
            return None

        x1, y1, x2, y2 = bbox
        x1 = max(0, min(width - 1, int(round(x1))))
        y1 = max(0, min(height - 1, int(round(y1))))
        x2 = max(0, min(width - 1, int(round(x2))))
        y2 = max(0, min(height - 1, int(round(y2))))

        if x2 <= x1 or y2 <= y1:
            return None

        return PlateDetection(
            bbox=(x1, y1, x2, y2),
            confidence=self._confidence(prediction),
            label=self._label(prediction),
            raw=prediction,
        )

    def _extract_bbox(self, prediction: dict[str, Any]) -> tuple[float, float, float, float] | None:
        if {"xmin", "ymin", "xmax", "ymax"}.issubset(prediction.keys()):
            return (
                float(prediction["xmin"]),
                float(prediction["ymin"]),
                float(prediction["xmax"]),
                float(prediction["ymax"]),
            )

        bbox = prediction.get("bbox") or prediction.get("bounding_box")
        parsed_bbox = self._parse_bbox_value(bbox)
        if parsed_bbox is not None:
            return parsed_bbox

        if {"x", "y", "width", "height"}.issubset(prediction.keys()):
            x_center = float(prediction["x"])
            y_center = float(prediction["y"])
            box_width = float(prediction["width"])
            box_height = float(prediction["height"])
            return (
                x_center - box_width / 2,
                y_center - box_height / 2,
                x_center + box_width / 2,
                y_center + box_height / 2,
            )

        points = prediction.get("points")
        if isinstance(points, list) and points:
            xs = [float(point["x"]) for point in points if isinstance(point, dict) and "x" in point]
            ys = [float(point["y"]) for point in points if isinstance(point, dict) and "y" in point]
            if xs and ys:
                return min(xs), min(ys), max(xs), max(ys)

        return None

    @staticmethod
    def _parse_bbox_value(value: Any) -> tuple[float, float, float, float] | None:
        if isinstance(value, dict):
            if {"xmin", "ymin", "xmax", "ymax"}.issubset(value.keys()):
                return (
                    float(value["xmin"]),
                    float(value["ymin"]),
                    float(value["xmax"]),
                    float(value["ymax"]),
                )
            if {"x", "y", "width", "height"}.issubset(value.keys()):
                x_center = float(value["x"])
                y_center = float(value["y"])
                box_width = float(value["width"])
                box_height = float(value["height"])
                return (
                    x_center - box_width / 2,
                    y_center - box_height / 2,
                    x_center + box_width / 2,
                    y_center + box_height / 2,
                )

        if isinstance(value, (list, tuple)) and len(value) >= 4:
            x1, y1, x2, y2 = [float(item) for item in value[:4]]
            return x1, y1, x2, y2

        return None


class PlateOCRService:
    """OCR-only service for cropped plate images."""

    def __init__(self) -> None:
        self.model = None
        self.device = _select_onnx_device()
        self._lock = threading.RLock()
        self._ready = False
        self._load_model()

    def is_ready(self) -> bool:
        return self._ready

    def _load_model(self) -> None:
        ocr_path = _resolve_path(VIDEO_OCR_MODEL_PATH)
        if not ocr_path.exists():
            logger.warning("Video OCR model not found at %s; plate text will be UNKNOWN", ocr_path)
            return
        if not YOLOV5_DIR.exists():
            logger.warning("YOLOv5 source not found at %s; plate text will be UNKNOWN", YOLOV5_DIR)
            return

        try:
            self.model = torch.hub.load(
                str(YOLOV5_DIR),
                "custom",
                path=str(ocr_path),
                source="local",
                force_reload=False,
                device=self.device,
            )
            self.model.conf = VIDEO_OCR_CONFIDENCE
            self.model.iou = 0.45
            self.model.max_det = 16
            self._ready = True
            logger.info("Video OCR model loaded from %s", ocr_path)
        except Exception as exc:
            logger.warning("Failed to load video OCR model: %s", exc, exc_info=True)

    @staticmethod
    def _merge_ocr_chars(ocr_df) -> str:
        if ocr_df.empty:
            return ""

        df = ocr_df.copy()
        df["y_center"] = (df["ymin"] + df["ymax"]) / 2.0
        df["char_height"] = df["ymax"] - df["ymin"]
        y_median = float(df["y_center"].median())
        y_std = float(df["y_center"].std() or 0.0)
        median_char_height = max(1.0, float(df["char_height"].median() or 1.0))

        if len(df) <= 1 or y_std < max(8.0, median_char_height * 0.45):
            df = df.sort_values("xmin")
            return "".join(str(c) for c in df["name"].tolist())

        top_row = df[df["y_center"] < y_median].sort_values("xmin")
        bottom_row = df[df["y_center"] >= y_median].sort_values("xmin")

        top_text = "".join(str(c) for c in top_row["name"].tolist())
        bottom_text = "".join(str(c) for c in bottom_row["name"].tolist())

        if top_text and bottom_text:
            return f"{top_text}-{bottom_text}"
        return top_text or bottom_text

    def recognize(self, plate_crop_bgr: np.ndarray) -> tuple[str, float]:
        if not self._ready or self.model is None or plate_crop_bgr.size == 0:
            return "", 0.0

        try:
            plate_crop_rgb = cv2.cvtColor(plate_crop_bgr, cv2.COLOR_BGR2RGB)
            height, width = plate_crop_rgb.shape[:2]
            if width < 100 or height < 30:
                scale = max(2.0, 200.0 / max(width, 1), 80.0 / max(height, 1))
                plate_crop_rgb = cv2.resize(
                    plate_crop_rgb,
                    (int(width * scale), int(height * scale)),
                    interpolation=cv2.INTER_CUBIC,
                )

            with self._lock, torch.no_grad():
                result = self.model(plate_crop_rgb, size=VIDEO_OCR_IMAGE_SIZE)
            ocr_df = result.pandas().xyxy[0]
            if ocr_df.empty:
                return "", 0.0

            plate_number = normalize_license_plate(self._merge_ocr_chars(ocr_df))
            confidence = float(ocr_df["confidence"].mean())
            return plate_number, confidence
        except Exception as exc:
            logger.debug("Video OCR failed: %s", exc, exc_info=True)
            return "", 0.0


_singleton_lock = threading.Lock()
_detector_singleton: LocalOnnxPlateDetector | None = None
_ocr_singleton: PlateOCRService | None = None


def get_video_detector() -> LocalOnnxPlateDetector:
    global _detector_singleton
    if _detector_singleton is None:
        with _singleton_lock:
            if _detector_singleton is None:
                _detector_singleton = LocalOnnxPlateDetector()
    return _detector_singleton


def get_video_ocr_service() -> PlateOCRService:
    global _ocr_singleton
    if _ocr_singleton is None:
        with _singleton_lock:
            if _ocr_singleton is None:
                _ocr_singleton = PlateOCRService()
    return _ocr_singleton
