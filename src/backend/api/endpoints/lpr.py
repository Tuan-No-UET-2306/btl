"""License Plate Recognition API endpoint - accepts image upload and returns plate number."""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ...models.database import SessionLocal
from ...models.models import DetectionHistory, User
from ...services.lpr_service import lpr_service
from ...socket.manager import manager
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

        # Save all detected plates to history
        db = SessionLocal()
        try:
            for plate in plates:
                if plate["plate_number"]:
                    detection = DetectionHistory(
                        plate_number=plate["plate_number"],
                        confidence=plate["confidence"],
                        image_url=None,
                        vehicle_type=None,
                        is_blacklisted=False,
                    )
                    db.add(detection)
                    db.flush()

                    manager.broadcast_event({
                        "event": "detection_created",
                        "detection_id": detection.id,
                        "plate_number": plate["plate_number"],
                    })
            db.commit()
        except Exception as e:
            db.rollback()
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
            "error": None,
        }

    except Exception as e:
        logger.error("LPR endpoint error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")