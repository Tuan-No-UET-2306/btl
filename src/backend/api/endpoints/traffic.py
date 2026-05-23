"""Traffic endpoints — license plate lookup, point calculation, complaints."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ...models.models import User
from ...models.schemas import (
    ComplaintCreate,
    ComplaintResponse,
    ComplaintStatusUpdate,
    ViolationCreate,
    ViolationUpdate,
)
from ...services.traffic_service import TrafficService
from ..dependencies import get_current_user, get_db, require_admin

router = APIRouter()


@router.get("/lookup/{plate_number}")
def lookup_plate(
    plate_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Look up a license plate.
    Returns vehicle info, owner, violations, demerit points (max 12).
    """
    service = TrafficService(db)
    return service.lookup_plate(plate_number)


@router.post("/complaints", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
def create_complaint(
    payload: ComplaintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """File a complaint against a specific violation. Tracks which user filed it."""
    service = TrafficService(db)
    return service.create_complaint(payload, current_user.id)


@router.get("/complaints")
def list_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List complaints.
    - Admin: sees all complaints
    - Regular user: sees only their own complaints
    """
    service = TrafficService(db)
    is_admin = current_user.role == "admin"
    return service.list_complaints(user_id=current_user.id, is_admin=is_admin)


@router.post("/violations", status_code=status.HTTP_201_CREATED)
def create_violation(
    payload: ViolationCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    [Admin Only] Manually log a traffic violation for a vehicle.
    Points deducted range: 2-10.
    Auto-blacklists the vehicle if cumulative points reach >= 12.
    """
    service = TrafficService(db)
    return service.create_violation(payload)


@router.put("/complaints/{complaint_id}/status")
def update_complaint_status(
    complaint_id: int,
    payload: ComplaintStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    [Admin Only] Approve or reject a complaint.
    If approved, the related violation is dismissed and points are restored.
    """
    service = TrafficService(db)
    return service.update_complaint_status(complaint_id, payload.status)


@router.put("/violations/{violation_id}")
def update_violation(
    violation_id: int,
    payload: ViolationUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    [Admin Only] Update violation details (type, points, fine, status).
    """
    service = TrafficService(db)
    return service.update_violation(violation_id, payload)
