"""Detection history endpoints — list, create, update, delete."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ...models.models import User
from ...models.schemas import DetectionCreate, DetectionResponse, DetectionUpdate
from ...services.detection_service import DetectionService

router = APIRouter()


@router.get("/", response_model=list[DetectionResponse])
def list_detections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    return service.list_detections()


@router.post("/", response_model=DetectionResponse, status_code=status.HTTP_201_CREATED)
def create_detection(
    payload: DetectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    return service.create_detection(
        plate_number=payload.plate_number,
        confidence=payload.confidence,
        image_url=payload.image_url,
        vehicle_type=payload.vehicle_type,
        is_blacklisted=payload.is_blacklisted,
    )


@router.put("/{detection_id}", response_model=DetectionResponse)
def update_detection(
    detection_id: int,
    payload: DetectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    return service.update_detection(
        detection_id=detection_id,
        plate_number=payload.plate_number,
        confidence=payload.confidence,
        image_url=payload.image_url,
        vehicle_type=payload.vehicle_type,
        is_blacklisted=payload.is_blacklisted,
    )


@router.delete("/{detection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_detection(
    detection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    service.delete_detection(detection_id)
    return None