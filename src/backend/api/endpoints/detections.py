"""Detection history endpoints — list, search, create, update, delete, export CSV."""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from pydantic import BaseModel

from ..dependencies import get_current_user, get_db
from ...models.models import User
from ...models.schemas import (
    DetectionCreate,
    DetectionResponse,
    DetectionUpdate,
    PaginatedDetectionResponse,
)
from ...services.detection_service import DetectionService


class BulkDeleteRequest(BaseModel):
    ids: list[int]

router = APIRouter()


@router.get("/", response_model=list[DetectionResponse])
def list_detections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    return service.list_detections(user_id=current_user.id)


@router.get("/search", response_model=PaginatedDetectionResponse)
def search_detections(
    plate_number: str = Query(None, description="Search by plate number (partial match)"),
    date_from: datetime = Query(None, description="Filter from date (ISO format)"),
    date_to: datetime = Query(None, description="Filter to date (ISO format)"),
    is_blacklisted: bool = Query(None, description="Filter by blacklist status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search detections with filters and pagination, scoped to current user."""
    service = DetectionService(db)
    items, total = service.search_detections(
        user_id=current_user.id,
        plate_number=plate_number,
        date_from=date_from,
        date_to=date_to,
        is_blacklisted=is_blacklisted,
        page=page,
        page_size=page_size,
    )
    return PaginatedDetectionResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.get("/export")
def export_detections_csv(
    plate_number: str = Query(None, description="Filter by plate number"),
    date_from: datetime = Query(None, description="Filter from date"),
    date_to: datetime = Query(None, description="Filter to date"),
    is_blacklisted: bool = Query(None, description="Filter by blacklist status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export detections to CSV file, scoped to current user."""
    service = DetectionService(db)
    items, _ = service.search_detections(
        user_id=current_user.id,
        plate_number=plate_number,
        date_from=date_from,
        date_to=date_to,
        is_blacklisted=is_blacklisted,
        page=1,
        page_size=100000,  # large enough to get all
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Plate Number", "Confidence", "Vehicle Type", "Blacklisted", "Created At"])
    for det in items:
        writer.writerow([
            det.id,
            det.plate_number,
            round(det.confidence, 4),
            det.vehicle_type or "",
            "Yes" if det.is_blacklisted else "No",
            det.created_at.isoformat() if det.created_at else "",
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=detections_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        },
    )


@router.post("/", response_model=DetectionResponse, status_code=status.HTTP_201_CREATED)
def create_detection(
    payload: DetectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    return service.create_detection(
        user_id=current_user.id,
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
        user_id=current_user.id,
        plate_number=payload.plate_number,
        confidence=payload.confidence,
        image_url=payload.image_url,
        vehicle_type=payload.vehicle_type,
        is_blacklisted=payload.is_blacklisted,
    )


@router.get("/merged")
def list_all_detections(
    plate_number: str = Query(None, description="Search by plate number (partial match)"),
    date_from: datetime = Query(None, description="Filter from date (ISO format)"),
    date_to: datetime = Query(None, description="Filter to date (ISO format)"),
    is_blacklisted: bool = Query(None, description="Filter by blacklist status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search ALL detections (LPR + Video) with filters and pagination, scoped to current user."""
    service = DetectionService(db)
    items, total = service.search_all_detections(
        user_id=current_user.id,
        plate_number=plate_number,
        date_from=date_from,
        date_to=date_to,
        is_blacklisted=is_blacklisted,
        page=page,
        page_size=page_size,
    )
    return PaginatedDetectionResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.get("/stats")
def get_detection_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return dashboard statistics for the current user."""
    service = DetectionService(db)
    return service.get_stats(user_id=current_user.id)


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_detections(
    payload: BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete multiple detections by IDs, scoped to current user."""
    service = DetectionService(db)
    deleted = service.delete_detections_bulk(payload.ids, user_id=current_user.id)
    return {"deleted": deleted, "success": True}


@router.delete("/{detection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_detection(
    detection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = DetectionService(db)
    service.delete_detection(detection_id, user_id=current_user.id)
    return None