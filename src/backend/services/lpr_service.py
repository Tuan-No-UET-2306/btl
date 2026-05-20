"""
License Plate Recognition Service
Uses YOLOv5 ONNX detector and OCR models for plate detection and text recognition.
Handles:
  - Single & multi-line plates (biển số 1 dòng / 2 dòng kiểu Việt Nam)
  - Multiple plates in one image
"""
import io
import logging
import threading
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image

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

SRC_DIR = Path(__file__).resolve().parents[2]  # src/
PROJECT_ROOT = SRC_DIR.parent
MODELS_DIR = SRC_DIR / "models"
YOLOV5_DIR = SRC_DIR / "yolov5"


def _resolve_model_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


DETECTOR_PATH = _resolve_model_path(VIDEO_DETECT_MODEL_PATH)
OCR_PATH = _resolve_model_path(VIDEO_OCR_MODEL_PATH)


def _read_onnx_square_input_size(model_path: Path) -> int | None:
    if model_path.suffix.lower() != ".onnx":
        return None

    try:
        import onnx

        model = onnx.load(str(model_path), load_external_data=False)
        dims = model.graph.input[0].type.tensor_type.shape.dim
        height = dims[2].dim_value
        width = dims[3].dim_value
        if height and width and height == width:
            return int(height)
    except Exception as exc:
        logger.debug("Could not inspect ONNX input size for %s: %s", model_path, exc)

    return None


def _select_onnx_device() -> str:
    if not torch.cuda.is_available():
        return "cpu"

    try:
        import onnxruntime
    except ImportError:
        return "cpu"

    return "cuda" if "CUDAExecutionProvider" in onnxruntime.get_available_providers() else "cpu"


class LPRService:
    """License Plate Recognition service using local ONNX models."""

    def __init__(self):
        self.detector = None
        self.ocr_model = None
        self.device = _select_onnx_device()
        self._detector_lock = threading.RLock()
        self._ocr_lock = threading.RLock()
        self._models_loaded = False
        self.detector_input_size = _read_onnx_square_input_size(DETECTOR_PATH)
        self.ocr_input_size = _read_onnx_square_input_size(OCR_PATH)
        self._load_models()

    def is_ready(self) -> bool:
        return self._models_loaded

    def _load_models(self):
        """Load detector and OCR models."""
        try:
            logger.info("Device: %s", self.device)
            logger.info("Model directory: %s", MODELS_DIR)

            if not DETECTOR_PATH.exists():
                logger.error("Detector model NOT FOUND at %s", DETECTOR_PATH)
                return
            if not OCR_PATH.exists():
                logger.error("OCR model NOT FOUND at %s", OCR_PATH)
                return
            if not YOLOV5_DIR.exists():
                logger.error("YOLOv5 source NOT FOUND at %s", YOLOV5_DIR)
                return

            logger.info("Loading detector model...")
            self.detector = torch.hub.load(
                str(YOLOV5_DIR),
                "custom",
                path=str(DETECTOR_PATH),
                source="local",
                force_reload=False,
                device=self.device,
            )
            self.detector.conf = VIDEO_DETECT_CONFIDENCE
            self.detector.iou = 0.45
            self.detector.max_det = 8
            logger.info(
                "Detector model loaded successfully; input_size=%s",
                self.detector_input_size or VIDEO_DETECT_IMAGE_SIZE,
            )

            logger.info("Loading OCR model...")
            self.ocr_model = torch.hub.load(
                str(YOLOV5_DIR),
                "custom",
                path=str(OCR_PATH),
                source="local",
                force_reload=False,
                device=self.device,
            )
            self.ocr_model.conf = VIDEO_OCR_CONFIDENCE
            self.ocr_model.iou = 0.45
            self.ocr_model.max_det = 16
            logger.info(
                "OCR model loaded successfully; input_size=%s",
                self.ocr_input_size or VIDEO_OCR_IMAGE_SIZE,
            )

            self._models_loaded = True

        except Exception as e:
            logger.error("Failed to load models: %s", e, exc_info=True)
            self._models_loaded = False

    @staticmethod
    def _decode_image(image_bytes: bytes) -> np.ndarray:
        """Convert bytes to BGR numpy array."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            try:
                pil_img = Image.open(io.BytesIO(image_bytes))
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception:
                raise ValueError("Cannot decode image from bytes")
        return img

    @staticmethod
    def _merge_ocr_chars(ocr_df) -> str:
        """
        Ghép các ký tự OCR thành biển số hoàn chỉnh.
        Xử lý biển số 2 dòng: tách theo y → dòng trên + dòng dưới.
        """
        if ocr_df.empty:
            return ""

        # Copy để không ảnh hưởng gốc
        df = ocr_df.copy()

        # Tính y trung bình của mỗi char để phân biệt dòng trên / dưới
        df["y_center"] = (df["ymin"] + df["ymax"]) / 2.0
        df["char_height"] = df["ymax"] - df["ymin"]
        y_median = float(df["y_center"].median())
        y_std = float(df["y_center"].std() or 0.0)
        median_char_height = max(1.0, float(df["char_height"].median() or 1.0))

        # Nếu std nhỏ → 1 dòng → sort theo x
        if len(df) <= 1 or y_std < max(8.0, median_char_height * 0.45):
            df = df.sort_values("xmin")
            return "".join(str(c) for c in df["name"].tolist())

        # Phân tách 2 dòng: dòng trên (y_center < median) và dòng dưới (y_center >= median)
        top_row = df[df["y_center"] < y_median].sort_values("xmin")
        bottom_row = df[df["y_center"] >= y_median].sort_values("xmin")

        top_text = "".join(str(c) for c in top_row["name"].tolist())
        bottom_text = "".join(str(c) for c in bottom_row["name"].tolist())

        if top_text and bottom_text:
            return f"{top_text}-{bottom_text}"
        return top_text or bottom_text

    def _ocr_plate(
        self,
        plate_crop_rgb: np.ndarray,
        image_size: int | None = None,
    ) -> tuple:
        """
        Nhận diện ký tự trên crop biển số.
        Returns: (plate_number: str, ocr_confidence: float)
        """
        if self.ocr_model is None:
            return "", 0.0

        # Tăng kích thước crop lên để OCR dễ đọc hơn
        h, w = plate_crop_rgb.shape[:2]
        if w < 100 or h < 30:
            scale = max(2.0, 200.0 / w, 80.0 / h)
            new_w = int(w * scale)
            new_h = int(h * scale)
            plate_crop_rgb = cv2.resize(
                plate_crop_rgb, (new_w, new_h), interpolation=cv2.INTER_CUBIC
            )

        effective_image_size = self.ocr_input_size or image_size or VIDEO_OCR_IMAGE_SIZE
        with self._ocr_lock, torch.no_grad():
            ocr_results = self.ocr_model(
                plate_crop_rgb,
                size=effective_image_size,
            )
        ocr_df = ocr_results.pandas().xyxy[0]

        if ocr_df.empty:
            return "", 0.0

        plate_number = normalize_license_plate(self._merge_ocr_chars(ocr_df))
        ocr_conf = float(ocr_df["confidence"].mean())

        return plate_number, ocr_conf

    @staticmethod
    def _is_reasonable_plate_box(
        bbox: tuple[int, int, int, int],
        image_width: int,
        image_height: int,
    ) -> bool:
        x1, y1, x2, y2 = bbox
        width = x2 - x1
        height = y2 - y1
        if width < 14 or height < 6:
            return False

        area_ratio = (width * height) / max(1, image_width * image_height)
        aspect_ratio = width / max(1, height)
        if area_ratio < 0.00004 or area_ratio > 0.08:
            return False
        return 0.8 <= aspect_ratio <= 9.5

    @staticmethod
    def _crop_plate_rgb(
        img_rgb: np.ndarray,
        bbox: tuple[int, int, int, int],
        padding_ratio: float = 0.12,
    ) -> np.ndarray:
        x1, y1, x2, y2 = bbox
        width = x2 - x1
        height = y2 - y1
        pad_x = int(width * padding_ratio)
        pad_y = int(height * padding_ratio)
        frame_height, frame_width = img_rgb.shape[:2]
        x1_pad = max(0, x1 - pad_x)
        y1_pad = max(0, y1 - pad_y)
        x2_pad = min(frame_width, x2 + pad_x)
        y2_pad = min(frame_height, y2 + pad_y)
        return img_rgb[y1_pad:y2_pad, x1_pad:x2_pad]

    def _detect_plate_rows(
        self,
        img_rgb: np.ndarray,
        min_confidence: float | None = None,
        max_plates: int | None = None,
        image_size: int | None = None,
    ):
        if self.detector is None:
            return None

        with self._detector_lock, torch.no_grad():
            previous_confidence = getattr(self.detector, "conf", None)
            try:
                if min_confidence is not None:
                    self.detector.conf = min_confidence
                effective_image_size = self.detector_input_size or image_size or VIDEO_DETECT_IMAGE_SIZE
                det_results = self.detector(
                    img_rgb,
                    size=effective_image_size,
                )
            finally:
                if min_confidence is not None and previous_confidence is not None:
                    self.detector.conf = previous_confidence

        det_df = det_results.pandas().xyxy[0]
        if det_df.empty:
            return det_df
        det_df = det_df.sort_values("confidence", ascending=False)
        if max_plates is not None:
            det_df = det_df.head(max_plates)
        return det_df

    @staticmethod
    def _combined_confidence(detect_confidence: float, ocr_confidence: float) -> float:
        if ocr_confidence > 0:
            return round((detect_confidence * 0.65) + (ocr_confidence * 0.35), 4)
        return round(detect_confidence, 4)

    def predict(
        self,
        image_bytes: bytes,
        *,
        run_ocr: bool = True,
        min_detect_confidence: float | None = None,
        max_plates: int | None = None,
        detect_image_size: int | None = None,
        ocr_image_size: int | None = None,
        return_crops: bool = False,
        realtime: bool = False,
    ) -> dict:
        """
        Run detection + OCR on an image. Supports multiple plates and multi-line plates.
        Returns: {
            "plates": [
                {
                    "plate_number": str,
                    "confidence": float,
                    "detect_confidence": float,
                    "ocr_confidence": float,
                    "bbox": [x1, y1, x2, y2]
                },
                ...
            ],
            "success": bool,
            "error": str or None
        }
        """
        if not self._models_loaded:
            return {
                "plates": [],
                "success": False,
                "error": "Models not loaded. Check server logs.",
            }

        try:
            img_bgr = self._decode_image(image_bytes)
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            image_height, image_width = img_rgb.shape[:2]
            log = logger.debug if realtime else logger.info
            log("LPR image shape: %s", img_rgb.shape)

            det_df = self._detect_plate_rows(
                img_rgb,
                min_confidence=min_detect_confidence,
                max_plates=max_plates,
                image_size=detect_image_size,
            )

            if det_df is None or det_df.empty:
                log("No license plate detected")
                return {
                    "plates": [],
                    "success": False,
                    "error": "No license plate detected in image",
                }

            log("Detected %d plate candidate(s)", len(det_df))

            plates = []
            for idx, (_, row) in enumerate(det_df.iterrows()):
                x1, y1, x2, y2 = map(
                    int,
                    [
                        round(float(row["xmin"])),
                        round(float(row["ymin"])),
                        round(float(row["xmax"])),
                        round(float(row["ymax"])),
                    ],
                )
                x1 = max(0, min(image_width - 1, x1))
                y1 = max(0, min(image_height - 1, y1))
                x2 = max(0, min(image_width, x2))
                y2 = max(0, min(image_height, y2))
                detect_conf = float(row["confidence"])
                detect_label = str(row.get("name", "plate"))
                bbox = (x1, y1, x2, y2)

                if not self._is_reasonable_plate_box(bbox, image_width, image_height):
                    logger.debug(
                        "Skipping implausible plate candidate #%d: bbox=%s image=%dx%d",
                        idx,
                        bbox,
                        image_width,
                        image_height,
                    )
                    continue

                plate_number = "UNKNOWN"
                ocr_conf = 0.0
                plate_crop = self._crop_plate_rgb(img_rgb, bbox)
                if run_ocr:
                    if plate_crop.size == 0:
                        logger.debug("Empty crop for detection #%d, skipping OCR", idx)
                    else:
                        try:
                            plate_number, ocr_conf = self._ocr_plate(
                                plate_crop,
                                image_size=ocr_image_size,
                            )
                            plate_number = plate_number or "UNKNOWN"
                        except Exception as exc:
                            logger.debug(
                                "OCR failed for detection #%d bbox=%s: %s",
                                idx,
                                bbox,
                                exc,
                                exc_info=True,
                            )

                overall_conf = self._combined_confidence(detect_conf, ocr_conf)
                logger.debug(
                    "Plate #%d result: label=%s plate=%s detect=%.4f ocr=%.4f bbox=%s",
                    idx,
                    detect_label,
                    plate_number,
                    detect_conf,
                    ocr_conf,
                    bbox,
                )

                plate_result = {
                    "plate_number": plate_number,
                    "confidence": overall_conf,
                    "detect_confidence": detect_conf,
                    "ocr_confidence": ocr_conf,
                    "bbox": [x1, y1, x2, y2],
                    "label": detect_label,
                    "has_ocr": bool(run_ocr and ocr_conf > 0),
                }
                if return_crops and plate_crop.size > 0:
                    plate_result["_crop_rgb"] = plate_crop

                plates.append(plate_result)

            if not plates:
                return {
                    "plates": [],
                    "success": False,
                    "error": "No valid license plate detected",
                }

            # Sort by confidence descending
            plates.sort(key=lambda p: p["confidence"], reverse=True)

            return {
                "plates": plates,
                "success": True,
                "error": None,
            }

        except Exception as e:
            logger.error("LPR prediction error: %s", e, exc_info=True)
            return {
                "plates": [],
                "success": False,
                "error": str(e),
            }


# Singleton instance
lpr_service = LPRService()
