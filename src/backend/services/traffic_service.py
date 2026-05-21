"""
Traffic service — business logic for license plate lookup, point calculation, complaints.
"""
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..core.exceptions import NotFoundException, BadRequestException
from ..models.models import Vehicle, Owner
from ..models.schemas import (
    ComplaintCreate,
    ComplaintResponse,
    ViolationInfo,
    ViolationCreate,
)
from ..repositories.traffic_repository import TrafficRepository

MAX_POINTS = 12
MONTHS_12 = timedelta(days=365)  # 12-month rule


class TrafficService:
    """Business logic for traffic violation system."""

    def __init__(self, db: Session) -> None:
        self.repo = TrafficRepository(db)

    def _apply_12_month_rule(self, vehicle_id: int) -> bool:
        """
        Check 12-month rule:
        If latest violation > 12 months ago and points never hit 0 → restore points.
        """
        latest_date = self.repo.get_latest_violation_date(vehicle_id)
        if latest_date is None:
            return False  # No violations ever → no restoration needed

        now = datetime.utcnow()
        if latest_date.tzinfo:
            from datetime import timezone
            now = now.replace(tzinfo=timezone.utc)

        if (now - latest_date) > MONTHS_12:
            # More than 12 months since last violation → restore points
            # Point restoration is simulated: if driver never reached 0, reset
            total_historical = self.repo.sum_all_points_deducted(vehicle_id)
            if total_historical < MAX_POINTS:
                # Driver never lost all points → auto-restore
                return True
        return False

    def lookup_plate(self, plate_number: str) -> dict[str, Any]:
        """
        Look up a license plate.
        Returns plate info, violations, points, and blacklist status.
        """
        # Step 1: Check blacklist
        blacklisted = self.repo.find_blacklisted_plate(plate_number)
        vehicle = self.repo.find_vehicle_by_plate(plate_number)

        if not vehicle:
            raise NotFoundException(detail=f"Vehicle with plate '{plate_number}' not found")

        # Get owner info
        owner = None
        if vehicle.owner_id:
            owner = self.repo.find_owner_by_id(vehicle.owner_id)

        # Check vehicle blacklist
        is_blacklisted = bool(blacklisted) or vehicle.is_blacklist == 1
        blacklist_reason = (
            blacklisted.reason if blacklisted else vehicle.blacklist_reason
        )

        # If blacklisted, return immediately (Step 5)
        if is_blacklisted:
            return {
                "plate_number": plate_number,
                "is_blacklisted": True,
                "blacklist_reason": blacklist_reason,
                "owner_name": owner.full_name if owner else None,
                "owner_citizen_id": owner.citizen_id if owner else None,
                "vehicle_type": vehicle.vehicle_type,
                "vehicle_brand": vehicle.brand,
                "vehicle_color": vehicle.color,
                "total_points_deducted": 0,
                "points_remaining": 0,
                "violations": [],
                "points_restored": False,
            }

        # Step 2a: 12-month rule check
        points_restored = self._apply_12_month_rule(vehicle.id)
        if points_restored:
            # Points restored to 12/12, clear violations from calculation
            return {
                "plate_number": plate_number,
                "is_blacklisted": False,
                "blacklist_reason": None,
                "owner_name": owner.full_name if owner else None,
                "owner_citizen_id": owner.citizen_id if owner else None,
                "vehicle_type": vehicle.vehicle_type,
                "vehicle_brand": vehicle.brand,
                "vehicle_color": vehicle.color,
                "total_points_deducted": 0,
                "points_remaining": MAX_POINTS,
                "violations": [],
                "points_restored": True,
            }

        # Step 2b: Get pending violations
        pending_violations = self.repo.find_pending_violations(vehicle.id)
        total_points = self.repo.sum_points_deducted(vehicle.id)
        points_remaining = max(0, MAX_POINTS - total_points)

        # Step 3: Auto-blacklist if points >= 12
        if total_points >= MAX_POINTS:
            reason = f"Driver accumulated {total_points} demerit points. License automatically suspended."
            self.repo.blacklist_vehicle(vehicle.id, reason)
            self.repo.add_blacklisted_plate(plate_number, reason)
            return {
                "plate_number": plate_number,
                "is_blacklisted": True,
                "blacklist_reason": reason,
                "owner_name": owner.full_name if owner else None,
                "owner_citizen_id": owner.citizen_id if owner else None,
                "vehicle_type": vehicle.vehicle_type,
                "vehicle_brand": vehicle.brand,
                "vehicle_color": vehicle.color,
                "total_points_deducted": total_points,
                "points_remaining": 0,
                "violations": [
                    ViolationInfo(
                        id=v.id,
                        violation_type=v.violation_type,
                        fine_amount=float(v.fine_amount) if v.fine_amount else None,
                        points_deducted=v.points_deducted or 0,
                        status=v.status,
                        issued_at=v.issued_at,
                    )
                    for v in pending_violations
                ],
                "points_restored": False,
            }

        # Step 4: Return normal response
        violations_info = [
            ViolationInfo(
                id=v.id,
                violation_type=v.violation_type,
                fine_amount=float(v.fine_amount) if v.fine_amount else None,
                points_deducted=v.points_deducted or 0,
                status=v.status,
                issued_at=v.issued_at,
            )
            for v in pending_violations
        ]

        return {
            "plate_number": plate_number,
            "is_blacklisted": False,
            "blacklist_reason": None,
            "owner_name": owner.full_name if owner else None,
            "owner_citizen_id": owner.citizen_id if owner else None,
            "vehicle_type": vehicle.vehicle_type,
            "vehicle_brand": vehicle.brand,
            "vehicle_color": vehicle.color,
            "total_points_deducted": total_points,
            "points_remaining": points_remaining,
            "violations": violations_info,
            "points_restored": False,
        }

    def create_violation(self, payload: ViolationCreate) -> dict[str, Any]:
        """
        Admin creates a new violation for a vehicle (Step 2).
        Points deducted range: 2-10.
        Auto-blacklist if accumulated >= 12.
        """
        vehicle = self.repo.find_vehicle_by_plate(payload.license_plate)
        if not vehicle:
            raise NotFoundException(
                detail=f"Vehicle with plate '{payload.license_plate}' not found"
            )

        # Check if already blacklisted
        if vehicle.is_blacklist == 1:
            raise BadRequestException(
                detail=f"Vehicle '{payload.license_plate}' is already blacklisted"
            )

        # Create the violation
        violation = self.repo.create_violation(
            vehicle_id=vehicle.id,
            violation_type=payload.violation_type,
            points_deducted=payload.points_deducted,
            fine_amount=payload.fine_amount,
        )

        # Recalculate total points
        total_points = self.repo.sum_all_points_deducted(vehicle.id)
        points_remaining = max(0, MAX_POINTS - total_points)
        new_cumulative = total_points

        # Check if auto-blacklist needed
        if new_cumulative >= MAX_POINTS:
            reason = f"Driver accumulated {new_cumulative} demerit points. License automatically suspended."
            self.repo.blacklist_vehicle(vehicle.id, reason)
            self.repo.add_blacklisted_plate(payload.license_plate, reason)
            return {
                "success": True,
                "violation_id": violation.id,
                "message": f"🔴 WARNING: This new violation has depleted the driver's remaining points. "
                          f"Vehicle {payload.license_plate} has been automatically pushed to the "
                          f"SYSTEM BLACKLIST and driving privileges are suspended.",
                "points_deducted": payload.points_deducted,
                "points_remaining": 0,
                "is_blacklisted": True,
                "blacklist_reason": reason,
            }

        # Points still remaining
        return {
            "success": True,
            "violation_id": violation.id,
            "message": f"Violation successfully logged! {payload.license_plate} deducted "
                      f"{payload.points_deducted} points. Driver's remaining balance: "
                      f"{points_remaining}/{MAX_POINTS}.",
            "points_deducted": payload.points_deducted,
            "points_remaining": points_remaining,
            "is_blacklisted": False,
        }

    def create_complaint(self, payload: ComplaintCreate) -> ComplaintResponse:
        """Create a new complaint for a violation."""
        from ..models.models import Violation as ViolationModel
        violation = (
            self.repo.db.query(ViolationModel)
            .filter(ViolationModel.id == payload.violation_id)
            .first()
        )
        if not violation:
            raise NotFoundException(
                detail=f"Violation with id '{payload.violation_id}' not found"
            )

        # Validate citizen_id is 12 digits
        if not payload.citizen_id.isdigit() or len(payload.citizen_id) != 12:
            raise BadRequestException(
                detail="Citizen ID must be exactly 12 digits"
            )

        complaint = self.repo.create_complaint(
            violation_id=payload.violation_id,
            full_name=payload.full_name,
            citizen_id=payload.citizen_id,
            reason=payload.reason,
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
        from ..models.models import Violation as ViolationModel

        complaint = self.repo.db.query(ComplaintModel).filter(ComplaintModel.id == complaint_id).first()
        if not complaint:
            raise NotFoundException(detail=f"Complaint with id '{complaint_id}' not found")

        old_status = complaint.status
        complaint.status = status
        self.repo.db.commit()

        # If complaint is approved, restore the deducted points
        # If rejected, keep points deducted as is
        if status == "approved":
            violation = self.repo.db.query(ViolationModel).filter(
                ViolationModel.id == complaint.violation_id
            ).first()
            if violation:
                violation.status = "dismissed"
                self.repo.db.commit()

        return {
            "success": True,
            "complaint_id": complaint_id,
            "old_status": old_status,
            "new_status": status,
            "message": f"Complaint #{complaint_id} has been {status}.",
        }

    def update_violation(self, violation_id: int, payload: "ViolationUpdate") -> dict:
        """Admin updates violation details (points, fine, type, status)."""
        from ..models.models import Violation as ViolationModel

        violation = self.repo.db.query(ViolationModel).filter(
            ViolationModel.id == violation_id
        ).first()
        if not violation:
            raise NotFoundException(detail=f"Violation with id '{violation_id}' not found")

        if payload.violation_type is not None:
            violation.violation_type = payload.violation_type
        if payload.points_deducted is not None:
            violation.points_deducted = payload.points_deducted
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

    def list_complaints(self) -> list[dict]:
        """List all complaints."""
        return self.repo.list_complaints()
