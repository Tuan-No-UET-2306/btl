"""
Blacklist service — CRUD operations for blacklisted plates.
Also syncs `is_blacklisted` flag in DetectionHistory and VideoDetection.
"""
from typing import Optional

from sqlalchemy.orm import Session

from ..core.exceptions import ConflictException, NotFoundException
from ..models.models import BlacklistedPlate, DetectionHistory, VideoDetection
from ..repositories.blacklist_repository import BlacklistRepository


class BlacklistService:
    """Business logic for blacklisted plate management."""

    def __init__(self, db: Session) -> None:
        self.repo = BlacklistRepository(db)
        self.db = db

    def list_blacklisted(self) -> list[BlacklistedPlate]:
        return self.repo.find_all()

    def create_blacklisted(
        self,
        plate_number: str,
        reason: Optional[str] = None,
        created_by: Optional[int] = None,
    ) -> BlacklistedPlate:
        existing = self.repo.find_by_plate_number(plate_number)
        if existing:
            raise ConflictException(
                detail=f"Plate '{plate_number}' is already blacklisted"
            )

        entry = self.repo.create(
            plate_number=plate_number,
            reason=reason,
            created_by=created_by,
        )

        # Sync: mark all existing detections with this plate as blacklisted
        self.db.query(DetectionHistory).filter(
            DetectionHistory.plate_number == plate_number
        ).update({"is_blacklisted": True})
        self.db.query(VideoDetection).filter(
            VideoDetection.plate_number == plate_number
        ).update({"is_blacklisted": True})
        self.db.commit()

        return entry

    def update_blacklisted(
        self,
        blacklist_id: int,
        reason: Optional[str] = None,
    ) -> BlacklistedPlate:
        entry = self.repo.find_by_id(blacklist_id)
        if not entry:
            raise NotFoundException(
                detail=f"Blacklisted entry with id '{blacklist_id}' not found"
            )
        return self.repo.update(entry, reason=reason)

    def delete_blacklisted(self, blacklist_id: int) -> None:
        entry = self.repo.find_by_id(blacklist_id)
        if not entry:
            raise NotFoundException(
                detail=f"Blacklisted entry with id '{blacklist_id}' not found"
            )

        plate_number = entry.plate_number
        self.repo.delete(entry)

        # Sync: mark all detections with this plate as not blacklisted
        self.db.query(DetectionHistory).filter(
            DetectionHistory.plate_number == plate_number
        ).update({"is_blacklisted": False})
        self.db.query(VideoDetection).filter(
            VideoDetection.plate_number == plate_number
        ).update({"is_blacklisted": False})

        # Reset vehicles.is_blacklist for this plate
        from ..models.models import Vehicle, Violation
        vehicle = self.db.query(Vehicle).filter(
            Vehicle.license_plate == plate_number
        ).first()
        if vehicle:
            vehicle.is_blacklist = 0
            vehicle.blacklist_reason = None

            # Dismiss all pending violations for this vehicle to restore points to 12/12
            self.db.query(Violation).filter(
                Violation.vehicle_id == vehicle.id,
                Violation.status == "pending",
            ).update({"status": "dismissed"})

        self.db.commit()

    def is_blacklisted(self, plate_number: str) -> bool:
        return self.repo.find_by_plate_number(plate_number) is not None