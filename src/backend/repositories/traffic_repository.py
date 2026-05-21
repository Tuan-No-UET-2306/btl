"""
Traffic repository — encapsulates Vehicle, Violation, Owner, Complaint operations.
"""
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.models import (
    BlacklistedPlate,
    Complaint,
    Owner,
    Vehicle,
    Violation,
)


class TrafficRepository:
    """Data access layer for traffic violation system."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_vehicle_by_plate(self, plate_number: str) -> Optional[Vehicle]:
        """Find vehicle by license plate, including owner info."""
        return (
            self.db.query(Vehicle)
            .filter(Vehicle.license_plate == plate_number)
            .first()
        )

    def find_owner_by_id(self, owner_id: int) -> Optional[Owner]:
        """Find owner by ID."""
        return self.db.query(Owner).filter(Owner.id == owner_id).first()

    def find_blacklisted_plate(self, plate_number: str) -> Optional[BlacklistedPlate]:
        """Check if a plate is in the blacklist table."""
        return (
            self.db.query(BlacklistedPlate)
            .filter(BlacklistedPlate.plate_number == plate_number)
            .first()
        )

    def find_pending_violations(self, vehicle_id: int) -> list[Violation]:
        """Get all pending violations for a vehicle."""
        return (
            self.db.query(Violation)
            .filter(
                Violation.vehicle_id == vehicle_id,
                Violation.status == "pending",
            )
            .all()
        )

    def sum_points_deducted(self, vehicle_id: int) -> int:
        """Sum all points_deducted from all violations for a vehicle."""
        result = (
            self.db.query(func.coalesce(func.sum(Violation.points_deducted), 0))
            .filter(Violation.vehicle_id == vehicle_id)
            .scalar()
        )
        return int(result) if result else 0

    def blacklist_vehicle(self, vehicle_id: int, reason: str) -> None:
        """Set a vehicle as blacklisted."""
        vehicle = self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if vehicle:
            vehicle.is_blacklist = 1
            vehicle.blacklist_reason = reason
            self.db.commit()

    def add_blacklisted_plate(self, plate_number: str, reason: str) -> BlacklistedPlate:
        """Add plate to blacklisted_plates table."""
        entry = BlacklistedPlate(
            plate_number=plate_number,
            reason=reason,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def create_complaint(
        self,
        violation_id: int,
        full_name: str,
        citizen_id: str,
        reason: str,
        phone_number: Optional[str] = None,
        address: Optional[str] = None,
        evidence_url: Optional[str] = None,
    ) -> Complaint:
        """Create a new complaint."""
        complaint = Complaint(
            violation_id=violation_id,
            full_name=full_name,
            citizen_id=citizen_id,
            reason=reason,
            phone_number=phone_number,
            address=address,
            evidence_url=evidence_url,
            status="pending",
        )
        self.db.add(complaint)
        self.db.commit()
        self.db.refresh(complaint)
        return complaint

    def get_latest_violation_date(self, vehicle_id: int):
        """Get the latest violation date for a vehicle."""
        from datetime import datetime
        result = (
            self.db.query(func.max(Violation.issued_at))
            .filter(Violation.vehicle_id == vehicle_id)
            .scalar()
        )
        return result

    def sum_all_points_deducted(self, vehicle_id: int) -> int:
        """Sum points_deducted from ALL violations for a vehicle (all statuses)."""
        result = (
            self.db.query(func.coalesce(func.sum(Violation.points_deducted), 0))
            .filter(Violation.vehicle_id == vehicle_id)
            .scalar()
        )
        return int(result) if result else 0

    def create_violation(
        self,
        vehicle_id: int,
        violation_type: str,
        points_deducted: int,
        fine_amount: Optional[float] = None,
    ) -> Violation:
        """Create a new violation record."""
        from datetime import datetime
        violation = Violation(
            vehicle_id=vehicle_id,
            violation_type=violation_type,
            points_deducted=points_deducted,
            fine_amount=fine_amount,
            status="pending",
            issued_at=datetime.utcnow(),
        )
        self.db.add(violation)
        self.db.commit()
        self.db.refresh(violation)
        return violation

    def list_complaints(self) -> list[dict]:
        """List all complaints with violation and vehicle info."""
        results = (
            self.db.query(
                Complaint,
                Violation.violation_type,
                Violation.points_deducted,
                Violation.status.label("violation_status"),
                Vehicle.license_plate,
            )
            .join(Violation, Complaint.violation_id == Violation.id)
            .join(Vehicle, Violation.vehicle_id == Vehicle.id)
            .order_by(Complaint.created_at.desc())
            .all()
        )

        return [
            {
                "id": c.Complaint.id,
                "violation_id": c.Complaint.violation_id,
                "full_name": c.Complaint.full_name,
                "citizen_id": c.Complaint.citizen_id,
                "phone_number": c.Complaint.phone_number,
                "address": c.Complaint.address,
                "reason": c.Complaint.reason,
                "evidence_url": c.Complaint.evidence_url,
                "status": c.Complaint.status,
                "created_at": c.Complaint.created_at,
                "case_id": f"#KP-{c.Complaint.id:05d}",
                "violation_type": c.violation_type,
                "points_deducted": c.points_deducted,
                "violation_status": c.violation_status,
                "license_plate": c.license_plate,
            }
            for c in results
        ]