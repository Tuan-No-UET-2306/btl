"""Blacklist endpoints — CRUD for blacklisted plates."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ...models.models import User
from ...models.schemas import BlacklistedPlateCreate, BlacklistedPlateResponse, BlacklistedPlateUpdate
from ...services.blacklist_service import BlacklistService
from ..dependencies import get_current_admin, get_current_user, get_db

router = APIRouter()


@router.get("/check/{plate_number}")
def check_blacklisted(
    plate_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if a specific plate number is blacklisted. Available to all authenticated users."""
    service = BlacklistService(db)
    entry = service.find_by_plate_number(plate_number)
    if entry:
        return {
            "is_blacklisted": True,
            "plate_number": entry.plate_number,
            "reason": entry.reason,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        }
    return {"is_blacklisted": False, "plate_number": plate_number, "reason": None, "created_at": None}


@router.get("/", response_model=list[BlacklistedPlateResponse])
def list_blacklisted(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = BlacklistService(db)
    return service.list_blacklisted()


@router.post("/", response_model=BlacklistedPlateResponse, status_code=status.HTTP_201_CREATED)
def create_blacklisted(
    payload: BlacklistedPlateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    service = BlacklistService(db)
    return service.create_blacklisted(
        plate_number=payload.plate_number,
        reason=payload.reason,
        created_by=current_user.id,
    )


@router.put("/{blacklist_id}", response_model=BlacklistedPlateResponse)
def update_blacklisted(
    blacklist_id: int,
    payload: BlacklistedPlateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    service = BlacklistService(db)
    return service.update_blacklisted(
        blacklist_id=blacklist_id,
        plate_number=payload.plate_number,
        reason=payload.reason,
    )


@router.delete("/{blacklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blacklisted(
    blacklist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    service = BlacklistService(db)
    service.delete_blacklisted(blacklist_id)
    return None
