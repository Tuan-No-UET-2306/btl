from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ...models.models import DetectionHistory, User
from ...models.schemas import DetectionCreate, DetectionResponse, DetectionUpdate
from ...socket.manager import manager

router = APIRouter()


@router.get("/", response_model=list[DetectionResponse])
def list_detections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(DetectionHistory).order_by(DetectionHistory.id.desc()).all()


@router.post("/", response_model=DetectionResponse, status_code=status.HTTP_201_CREATED)
def create_detection(
    payload: DetectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detection = DetectionHistory(
        plate_number=payload.plate_number,
        confidence=payload.confidence,
        image_url=payload.image_url,
        vehicle_type=payload.vehicle_type,
        is_blacklisted=payload.is_blacklisted,
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)

    manager.broadcast_event(
        {
            "event": "detection_created",
            "detection_id": detection.id,
            "plate_number": detection.plate_number,
        }
    )
    return detection


@router.put("/{detection_id}", response_model=DetectionResponse)
def update_detection(
    detection_id: int,
    payload: DetectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detection = db.query(DetectionHistory).filter(DetectionHistory.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")

    if payload.plate_number is not None:
        detection.plate_number = payload.plate_number
    if payload.confidence is not None:
        detection.confidence = payload.confidence
    if payload.image_url is not None:
        detection.image_url = payload.image_url
    if payload.vehicle_type is not None:
        detection.vehicle_type = payload.vehicle_type
    if payload.is_blacklisted is not None:
        detection.is_blacklisted = payload.is_blacklisted

    db.commit()
    db.refresh(detection)

    manager.broadcast_event(
        {"event": "detection_updated", "detection_id": detection.id}
    )
    return detection


@router.delete("/{detection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_detection(
    detection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detection = db.query(DetectionHistory).filter(DetectionHistory.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")

    db.delete(detection)
    db.commit()
    manager.broadcast_event(
        {"event": "detection_deleted", "detection_id": detection_id}
    )
    return None
