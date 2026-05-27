"""
Traffic service — business logic for license plate lookup, point calculation, complaints.
"""
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from ..core.exceptions import NotFoundException, BadRequestException
from ..models.models import Vehicle, Owner, Violation as ViolationModel
from ..models.schemas import (
    ComplaintCreate,
    ComplaintResponse,
    ViolationInfo,
    ViolationCreate,
)
from ..repositories.traffic_repository import TrafficRepository

MAX_POINTS = 12


class TrafficService:
    """Business logic for traffic violation system."""

    def __init__(self, db: Session) -> None:
        self.repo = TrafficRepository(db)

    def lookup_plate(self, plate_number: str) -> dict[str, Any]:
        """
        Look up a license plate.
        Returns plate info, violations, points, and blacklist status.
        """
        blacklisted = self.repo.find_blacklisted_plate(plate_number)
        vehicle = self.repo.find_vehicle_by_plate(plate_number)

        # Get owner info if vehicle exists
        owner = None
        if vehicle and vehicle.owner_id:
            owner = self.repo.find_owner_by_id(vehicle.owner_id)

        # Check blacklist
        is_blacklisted = bool(blacklisted) or (vehicle and vehicle.is_blacklist == 1)
        blacklist_reason = (
            blacklisted.reason if blacklisted else (vehicle.blacklist_reason if vehicle else None)
        )

        if is_blacklisted:
            return {
                "plate_number": plate_number,
                "is_blacklisted": True,
                "blacklist_reason": blacklist_reason,
                "owner_name": owner.full_name if owner else None,
                "owner_citizen_id": owner.citizen_id if owner else None,
                "vehicle_type": vehicle.vehicle_type if vehicle else None,
                "vehicle_brand": vehicle.brand if vehicle else None,
                "vehicle_color": vehicle.color if vehicle else None,
                "total_points_deducted": 0,
                "points_remaining": 0,
                "violations": [],
                "points_restored": False,
            }

        # Get violations by plate_number (uses raw SQL to avoid missing column errors)
        violations_data = self.repo.get_violations_by_plate(plate_number)
        total_points = self.repo.sum_points_by_plate(plate_number)
        points_remaining = max(0, MAX_POINTS - total_points)

        pending_violations_data = [v for v in violations_data if v["status"] == "pending"]
        violations_info = [
            ViolationInfo(
                id=v["id"],
                violation_type=v["violation_type"],
                fine_amount=v["fine_amount"],
                points_deducted=v["points_deducted"] or 0,
                status=v["status"],
                issued_at=v["issued_at"],
            )
            for v in pending_violations_data
        ]

        # Auto-blacklist if >= 12
        if total_points >= MAX_POINTS:
            reason = f"Driver accumulated {total_points} demerit points. License automatically suspended."
            if vehicle and vehicle.id > 0:
                self.repo.blacklist_vehicle(vehicle.id, reason)
            self.repo.add_blacklisted_plate(plate_number, reason)
            return {
                "plate_number": plate_number,
                "is_blacklisted": True,
                "blacklist_reason": reason,
                "owner_name": owner.full_name if owner else None,
                "owner_citizen_id": owner.citizen_id if owner else None,
                "vehicle_type": vehicle.vehicle_type if vehicle else None,
                "vehicle_brand": vehicle.brand if vehicle else None,
                "vehicle_color": vehicle.color if vehicle else None,
                "total_points_deducted": total_points,
                "points_remaining": 0,
                "violations": violations_info,
                "points_restored": False,
            }

        return {
            "plate_number": plate_number,
            "is_blacklisted": False,
            "blacklist_reason": None,
            "owner_name": owner.full_name if owner else None,
            "owner_citizen_id": owner.citizen_id if owner else None,
            "vehicle_type": vehicle.vehicle_type if vehicle else None,
            "vehicle_brand": vehicle.brand if vehicle else None,
            "vehicle_color": vehicle.color if vehicle else None,
            "total_points_deducted": total_points,
            "points_remaining": points_remaining,
            "violations": violations_info,
            "points_restored": False,
        }

    def create_violation(self, payload: ViolationCreate) -> dict[str, Any]:
        """
        Admin creates a new violation for ANY plate number.
        No vehicle/DB validation required. Saves directly with plate string.
        Points deducted range: 0-10.
        """
        points = max(0, min(10, payload.points_deducted))

        violation = self.repo.create_violation_simple(
            plate_number=payload.license_plate,
            violation_type=payload.violation_type,
            points_deducted=points,
            fine_amount=payload.fine_amount,
        )

        # Calculate cumulative points for this plate (uses raw SQL, safe with missing columns)
        total_points = self.repo.sum_points_by_plate(payload.license_plate)
        points_remaining = max(0, MAX_POINTS - total_points)

        if total_points >= MAX_POINTS:
            reason = f"Driver accumulated {total_points} demerit points. License automatically suspended."
            self.repo.add_blacklisted_plate(payload.license_plate, reason)
            return {
                "success": True,
                "violation_id": violation.id,
                "message": f"🔴 WARNING: This new violation has depleted the driver's remaining points. "
                          f"Vehicle {payload.license_plate} has been automatically pushed to the "
                          f"SYSTEM BLACKLIST and driving privileges are suspended.",
                "points_deducted": points,
                "points_remaining": 0,
                "is_blacklisted": True,
                "blacklist_reason": reason,
            }

        return {
            "success": True,
            "violation_id": violation.id,
            "message": f"Violation successfully logged! {payload.license_plate} deducted "
                      f"{points} points. Driver's remaining balance: "
                      f"{points_remaining}/{MAX_POINTS}.",
            "points_deducted": points,
            "points_remaining": points_remaining,
            "is_blacklisted": False,
        }

    def create_complaint(self, payload: ComplaintCreate, current_user_id: int) -> ComplaintResponse:
        """Create a new complaint for a violation."""
        violation = (
            self.repo.db.query(ViolationModel)
            .filter(ViolationModel.id == payload.violation_id)
            .first()
        )
        if not violation:
            raise NotFoundException(
                detail=f"Violation with id '{payload.violation_id}' not found"
            )

        if not payload.citizen_id.isdigit() or len(payload.citizen_id) != 12:
            raise BadRequestException(detail="Citizen ID must be exactly 12 digits")

        complaint = self.repo.create_complaint(
            violation_id=payload.violation_id,
            user_id=current_user_id,
            full_name=payload.full_name,
            citizen_id=payload.citizen_id,
            reason=payload.reason,
            plate_number=violation.plate_number,
            phone_number=payload.phone_number,
            address=payload.address,
            evidence_url=payload.evidence_url,
        )

        return ComplaintResponse(
            id=complaint.id,
            violation_id=complaint.violation_id,
            full_name=complaint.full_name,
            citizen_id=complaint.citizen_id,
            phone_number=complaint.phone_number,
            address=complaint.address,
            reason=complaint.reason,
            evidence_url=complaint.evidence_url,
            status=complaint.status,
            created_at=complaint.created_at,
            case_id=f"#KP-{complaint.id:05d}",
        )

    def update_complaint_status(self, complaint_id: int, status: str) -> dict:
        """Admin approves or rejects a complaint. Updates related violation points."""
        from ..models.models import Complaint as ComplaintModel

        complaint = self.repo.db.query(ComplaintModel).filter(ComplaintModel.id == complaint_id).first()
        if not complaint:
            raise NotFoundException(detail=f"Complaint with id '{complaint_id}' not found")

        old_status = complaint.status
        complaint.status = status
        self.repo.db.commit()

        violation = self.repo.db.query(ViolationModel).filter(
            ViolationModel.id == complaint.violation_id
        ).first()
        if violation:
            if status == "approved":
                violation.status = "dismissed"
            elif status == "rejected":
                violation.status = "approved"
            self.repo.db.commit()

        return {
            "success": True,
            "complaint_id": complaint_id,
            "old_status": old_status,
            "new_status": status,
            "message": f"Complaint #{complaint_id} has been {status}.",
        }

    def update_violation(self, violation_id: int, payload: "ViolationUpdate") -> dict:
        """Admin updates violation details (points 0-12, fine, type, status)."""
        from ..models.models import Violation as ViolationModel

        violation = self.repo.db.query(ViolationModel).filter(
            ViolationModel.id == violation_id
        ).first()
        if not violation:
            raise NotFoundException(detail=f"Violation with id '{violation_id}' not found")

        if payload.violation_type is not None:
            violation.violation_type = payload.violation_type
        if payload.points_deducted is not None:
            violation.points_deducted = max(0, min(12, payload.points_deducted))
        if payload.fine_amount is not None:
            violation.fine_amount = payload.fine_amount
        if payload.status is not None:
            violation.status = payload.status

        self.repo.db.commit()
        self.repo.db.refresh(violation)

        return {
            "success": True,
            "violation_id": violation.id,
            "message": f"Violation #{violation_id} updated successfully.",
            "violation_type": violation.violation_type,
            "points_deducted": violation.points_deducted,
            "fine_amount": float(violation.fine_amount) if violation.fine_amount else None,
            "status": violation.status,
        }

    def list_violated_plates(self) -> list[dict]:
        """List all plates with pending violations and their total points."""
        return self.repo.list_violated_plates()

    def list_complaints(self, user_id: Optional[int] = None, is_admin: bool = False) -> list[dict]:
        """
        List complaints.
        - Admin: sees all
        - Regular user: sees only their own
        """
        if is_admin:
            return self.repo.list_complaints(user_id=None)
        return self.repo.list_complaints(user_id=user_id)