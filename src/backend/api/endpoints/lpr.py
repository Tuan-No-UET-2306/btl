"""License Plate Recognition API endpoint — accepts image upload and returns plate number."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.security import OAuth2PasswordBearer

from ...core.config import (
    VIDEO_REALTIME_DETECT_CONFIDENCE,
    VIDEO_REALTIME_DETECT_IMAGE_SIZE,
    VIDEO_REALTIME_MAX_PLATES,
    VIDEO_REALTIME_OCR_IMAGE_SIZE,
)
from ...core.security import decode_access_token
from ...models.database import SessionLocal
from ...models.models import User
from ...services.detection_service import DetectionService
from ...services.lpr_service import lpr_service
from ...services.minio_service import minio_service
from ...services.realtime_crop_cache import realtime_crop_cache
from ..dependencies import get_db
from jose import JWTError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Get user if token is provided and valid, otherwise return None."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.query(User).filter(User.id == int(user_id)).first()
        return user
    except (JWTError, ValueError):
        return None


def _read_upload_image(file: UploadFile) -> bytes:
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
    return image_bytes


@router.post("/recognize")
def recognize_plate(
    file: UploadFile = File(...),
    persist: bool = Query(
        True,
        description="Save source image and detections to history. Disable for realtime frame scans.",
    ),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Upload an image of a vehicle/license plate and get the recognized plate number(s).
    Uses YOLOv5 detector + OCR models.
    Supports: multi-line plates (biển số 2 dòng) and multiple plates in one image.
    The original image is saved to MinIO for later reference.
    """
    image_bytes = _read_upload_image(file)

    username = current_user.username if current_user else "anonymous"
    logger.info(
        "LPR request: user=%s, file=%s, size=%d bytes",
        username, file.filename, len(image_bytes),
    )

    try:
        result = lpr_service.predict(image_bytes)

        if not result["success"] or not result.get("plates"):
            logger.warning(
                "LPR failed for user=%s: %s",
                username, result.get("error"),
            )
            return {
                "success": False,
                "plates": [],
                "error": result.get("error", "No plate detected"),
            }

        plates = result["plates"]

        image_url = None

        # Only save to history if user is authenticated and persist=True
        if persist and current_user:
            # Upload original image to MinIO and save detected plates to history.
            try:
                image_url = minio_service.upload_bytes(
                    image_bytes,
                    filename=file.filename or "capture.jpg",
                    content_type=file.content_type or "image/jpeg",
                )
                logger.info("Image saved to MinIO: %s", image_url)
            except Exception as e:
                logger.warning("Failed to upload image to MinIO: %s", e)

            db = SessionLocal()
            try:
                detection_service = DetectionService(db)
                detection_service.save_lpr_results(
                    user_id=current_user.id,
                    plates=plates,
                    image_url=image_url,
                )
            except Exception as e:
                logger.error("DB error saving detections: %s", e)
            finally:
                db.close()
        elif persist and not current_user:
            logger.warning("Cannot persist without authentication: user not logged in")

        logger.info(
            "LPR success: user=%s, %d plate(s) detected: %s",
            username,
            len(plates),
            [p["plate_number"] for p in plates],
        )

        return {
            "success": True,
            "plates": plates,
            "plates_count": len(plates),
            "image_url": image_url,
            "persisted": persist,
            "error": None,
        }

    except Exception as e:
        logger.error("LPR endpoint error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")


@router.post("/realtime-frame")
def recognize_realtime_frame(
    request: Request,
    file: UploadFile = File(...),
    ocr: bool = Query(True, description="Run OCR on detected plate crops."),
    cache_crops: bool = Query(
        True,
        description="Store detected plate crops in the realtime cache and return temporary crop URLs.",
    ),
    max_plates: int = Query(
        VIDEO_REALTIME_MAX_PLATES,
        ge=1,
        le=8,
        description="Maximum plate candidates to process from this frame.",
    ),
    min_confidence: float = Query(
        VIDEO_REALTIME_DETECT_CONFIDENCE,
        ge=0.05,
        le=1.0,
        description="Detector confidence threshold for realtime frames.",
    ),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Lightweight realtime frame endpoint.
    It never persists images/detections and can skip OCR for most frames so the
    frontend can track boxes cheaply while refreshing plate text periodically.
    """
    image_bytes = _read_upload_image(file)
    username = current_user.username if current_user else "anonymous"
    logger.debug(
        "Realtime LPR frame: user=%s, file=%s, size=%d bytes, ocr=%s",
        username,
        file.filename,
        len(image_bytes),
        ocr,
    )

    try:
        result = lpr_service.predict(
            image_bytes,
            run_ocr=ocr,
            min_detect_confidence=min_confidence,
            max_plates=max_plates,
            detect_image_size=VIDEO_REALTIME_DETECT_IMAGE_SIZE,
            ocr_image_size=VIDEO_REALTIME_OCR_IMAGE_SIZE,
            return_crops=cache_crops,
            realtime=True,
        )
        plates = result.get("plates") or []
        if cache_crops:
            for index, plate in enumerate(plates):
                crop_rgb = plate.pop("_crop_rgb", None)
                cache_key = realtime_crop_cache.put_rgb_image(
                    crop_rgb,
                    metadata={
                        "plate_number": plate.get("plate_number"),
                        "confidence": plate.get("confidence"),
                        "bbox": plate.get("bbox"),
                        "index": index,
                    },
                ) if crop_rgb is not None else None
                if cache_key:
                    plate["crop_cache_key"] = cache_key
                    plate["crop_image_url"] = str(
                        request.url_for("get_realtime_crop", cache_key=cache_key)
                    )
        return {
            "success": bool(plates),
            "plates": plates,
            "plates_count": len(plates),
            "persisted": False,
            "ocr": ocr,
            "error": None if plates else result.get("error", "No plate detected"),
        }
    except Exception as e:
        logger.error("Realtime LPR endpoint error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Realtime recognition failed: {str(e)}")


@router.get("/realtime-crops/{cache_key}", name="get_realtime_crop")
def get_realtime_crop(cache_key: str) -> Response:
    cached = realtime_crop_cache.get(cache_key)
    if cached is None:
        raise HTTPException(status_code=404, detail="Realtime crop expired or not found")

    return Response(
        content=cached.data,
        media_type=cached.content_type,
        headers={
            "Cache-Control": f"private, max-age={realtime_crop_cache.ttl_seconds}",
            "X-Realtime-Crop-Cache": "hit",
        },
    )
