"""
License Plate Recognition Service
Uses YOLOv5 ONNX detector and OCR models for plate detection and text recognition.
Handles:
  - Single & multi-line plates (biển số 1 dòng / 2 dòng kiểu Việt Nam)
  - Multiple plates in one image
"""
import io
import logging
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image

from .plate_format import normalize_license_plate

logger = logging.getLogger(__name__)

SRC_DIR = Path(__file__).resolve().parents[2]  # src/
MODELS_DIR = SRC_DIR / "models"
DETECTOR_PATH = MODELS_DIR / "LP_detector_nano_61.onnx"
OCR_PATH = MODELS_DIR / "LP_ocr_nano_62.onnx"
YOLOV5_DIR = SRC_DIR / "yolov5"


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
        self._models_loaded = False
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
            self.detector.conf = 0.5
            self.detector.iou = 0.45
            logger.info("Detector model loaded successfully")

            logger.info("Loading OCR model...")
            self.ocr_model = torch.hub.load(
                str(YOLOV5_DIR),
                "custom",
                path=str(OCR_PATH),
                source="local",
                force_reload=False,
                device=self.device,
            )
            self.ocr_model.conf = 0.3
            logger.info("OCR model loaded successfully")

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
        y_median = df["y_center"].median()
        y_std = df["y_center"].std()

        # Nếu std nhỏ → 1 dòng → sort theo x
        if y_std < 10:
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

    def _ocr_plate(self, plate_crop_rgb: np.ndarray) -> tuple:
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

        ocr_results = self.ocr_model(plate_crop_rgb)
        ocr_df = ocr_results.pandas().xyxy[0]

        if ocr_df.empty:
            return "", 0.0

        plate_number = normalize_license_plate(self._merge_ocr_chars(ocr_df))
        ocr_conf = float(ocr_df["confidence"].mean())

        return plate_number, ocr_conf

    def predict(self, image_bytes: bytes) -> dict:
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
            logger.info("Image shape: %s", img_rgb.shape)

            # Step 1: Detect ALL license plates
            logger.info("Running plate detection...")
            det_results = self.detector(img_rgb)
            det_df = det_results.pandas().xyxy[0]

            if det_df.empty:
                logger.info("No license plate detected")
                return {
                    "plates": [],
                    "success": False,
                    "error": "No license plate detected in image",
                }

            logger.info("Detected %d object(s)", len(det_df))
            logger.info("Labels: %s", det_df["name"].tolist())

            plates = []

            # Sort by confidence descending, process each detection
            det_df = det_df.sort_values("confidence", ascending=False)

            for idx, (_, row) in enumerate(det_df.iterrows()):
                x1, y1, x2, y2 = map(int, [
                    row["xmin"], row["ymin"], row["xmax"], row["ymax"]
                ])
                detect_conf = float(row["confidence"])
                detect_label = str(row["name"])

                # Bỏ qua detection quá nhỏ
                if (x2 - x1) < 20 or (y2 - y1) < 10:
                    logger.info("Skipping small detection #%d: %dx%d", idx, x2 - x1, y2 - y1)
                    continue

                # Crop plate region (with some padding)
                pad_x = int((x2 - x1) * 0.08)
                pad_y = int((y2 - y1) * 0.08)
                x1_pad = max(0, x1 - pad_x)
                y1_pad = max(0, y1 - pad_y)
                x2_pad = min(img_rgb.shape[1], x2 + pad_x)
                y2_pad = min(img_rgb.shape[0], y2 + pad_y)

                plate_crop = img_rgb[y1_pad:y2_pad, x1_pad:x2_pad]

                if plate_crop.size == 0:
                    logger.warning("Empty crop for detection #%d, skipping", idx)
                    continue

                logger.info(
                    "Processing plate #%d: label=%s, conf=%.4f, bbox=[%d,%d,%d,%d]",
                    idx, detect_label, detect_conf, x1, y1, x2, y2,
                )

                # Step 2: OCR on cropped plate
                plate_number, ocr_conf = self._ocr_plate(plate_crop)

                overall_conf = round((detect_conf + ocr_conf) / 2, 4) if ocr_conf > 0 else detect_conf

                logger.info(
                    "Plate #%d result: '%s' (detect=%.4f, ocr=%.4f, overall=%.4f)",
                    idx, plate_number, detect_conf, ocr_conf, overall_conf,
                )

                plates.append({
                    "plate_number": plate_number,
                    "confidence": overall_conf,
                    "detect_confidence": detect_conf,
                    "ocr_confidence": ocr_conf,
                    "bbox": [x1, y1, x2, y2],
                })

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
