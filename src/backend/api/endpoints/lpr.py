"""License Plate Recognition API endpoint — accepts image upload and returns plate number."""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ...models.database import SessionLocal
from ...models.models import User
from ...services.detection_service import DetectionService
from ...services.lpr_service import lpr_service
from ...services.minio_service import minio_service
from ..dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/recognize")
def recognize_plate(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload an image of a vehicle/license plate and get the recognized plate number(s).
    Uses YOLOv5 detector + OCR models.
    Supports: multi-line plates (biển số 2 dòng) and multiple plates in one image.
    The original image is saved to MinIO for later reference.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    image_bytes = file.file.read()

    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    logger.info(
        "LPR request: user=%s, file=%s, size=%d bytes",
        current_user.username, file.filename, len(image_bytes),
    )

    try:
        result = lpr_service.predict(image_bytes)

        if not result["success"] or not result.get("plates"):
            logger.warning(
                "LPR failed for user=%s: %s",
                current_user.username, result.get("error"),
            )
            return {
                "success": False,
                "plates": [],
                "error": result.get("error", "No plate detected"),
            }

        plates = result["plates"]

        # Upload original image to MinIO
        image_url = None
        try:
            image_url = minio_service.upload_bytes(
                image_bytes,
                filename=file.filename or "capture.jpg",
                content_type=file.content_type or "image/jpeg",
            )
            logger.info("Image saved to MinIO: %s", image_url)
        except Exception as e:
            logger.warning("Failed to upload image to MinIO: %s", e)

        # Save detected plates to history with image_url
        db = SessionLocal()
        try:
            detection_service = DetectionService(db)
            detection_service.save_lpr_results(plates, image_url=image_url)
        except Exception as e:
            logger.error("DB error saving detections: %s", e)
        finally:
            db.close()

        logger.info(
            "LPR success: user=%s, %d plate(s) detected: %s",
            current_user.username,
            len(plates),
            [p["plate_number"] for p in plates],
        )

        return {
            "success": True,
            "plates": plates,
            "plates_count": len(plates),
            "image_url": image_url,
            "error": None,
        }

    except Exception as e:
        logger.error("LPR endpoint error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")