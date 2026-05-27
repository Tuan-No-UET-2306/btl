"""
Traffic repository — encapsulates Vehicle, Violation, Owner, Complaint operations.
Handles missing columns gracefully for Supabase compatibility.
"""
from typing import Optional

from sqlalchemy import func, text
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
        """Find vehicle by license plate."""
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

    # ───── Violations ─────

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

    def get_violations_by_plate(self, plate_number: str) -> list[dict]:
        """Get violations by vehicle's license_plate via JOIN."""
        try:
            result = self.db.execute(
                text("SELECT v.id, v.vehicle_id, v.violation_type, v.fine_amount, "
                     "COALESCE(v.points_deducted, 0) as points_deducted, v.status, v.issued_at, "
                     "veh.license_plate as plate_number "
                     "FROM violations v "
                     "JOIN vehicles veh ON v.vehicle_id = veh.id "
                     "WHERE veh.license_plate = :plate ORDER BY v.issued_at DESC"),
                {"plate": plate_number}
            ).fetchall()
            return [
                {
                    "id": r[0],
                    "vehicle_id": r[1],
                    "violation_type": r[2],
                    "fine_amount": float(r[3]) if r[3] else None,
                    "points_deducted": r[4] or 0,
                    "status": r[5],
                    "issued_at": r[6],
                    "plate_number": r[7] or "",
                }
                for r in result
            ]
        except Exception:
            return []

    def sum_points_by_plate(self, plate_number: str) -> int:
        """Sum points_deducted for a plate via vehicle JOIN."""
        try:
            result = self.db.execute(
                text("SELECT COALESCE(SUM(COALESCE(v.points_deducted, 0)), 0) "
                     "FROM violations v "
                     "JOIN vehicles veh ON v.vehicle_id = veh.id "
                     "WHERE veh.license_plate = :plate "
                     "AND v.status IN ('pending', 'approved')"),
                {"plate": plate_number}
            ).scalar()
            return int(result) if result else 0
        except Exception:
            return 0

    def list_violated_plates(self) -> list[dict]:
        """List all plates that have pending violations, grouped with total points."""
        try:
            result = self.db.execute(
                text("SELECT "
                     "COALESCE(veh.license_plate, '') as plate_number, "
                     "COUNT(v.id) as violation_count, "
                     "SUM(COALESCE(v.points_deducted, 0)) as total_points, "
                     "MAX(v.issued_at) as latest_violation "
                     "FROM violations v "
                     "LEFT JOIN vehicles veh ON v.vehicle_id = veh.id "
                     "WHERE v.status = 'pending' "
                     "GROUP BY veh.license_plate "
                     "ORDER BY latest_violation DESC")
            ).fetchall()
            return [
                {
                    "plate_number": r[0],
                    "violation_count": r[1],
                    "total_points": r[2] or 0,
                    "points_remaining": max(0, 12 - (r[2] or 0)),
                    "latest_violation": r[3],
                }
                for r in result
            ]
        except Exception as e:
            print(f"Error in list_violated_plates: {e}")
            return []

    def _ensure_vehicle_exists(self, plate_number: str) -> int:
        """Find a vehicle by plate or create one, return its ID."""
        existing = self.find_vehicle_by_plate(plate_number)
        if existing:
            return existing.id

        from datetime import datetime
        vehicle = Vehicle(
            license_plate=plate_number,
            vehicle_type="Unknown",
            created_at=datetime.utcnow(),
        )
        self.db.add(vehicle)
        self.db.commit()
        self.db.refresh(vehicle)
        return vehicle.id

    def create_violation_simple(
        self,
        plate_number: str,
        violation_type: str,
        points_deducted: int,
        fine_amount: Optional[float] = None,
    ) -> Violation:
        """Create a new violation by plate number. Auto-creates vehicle if needed."""
        from datetime import datetime
        now = datetime.utcnow()
        vehicle_id = self._ensure_vehicle_exists(plate_number)

        result = self.db.execute(
            text("INSERT INTO violations (vehicle_id, violation_type, "
                 "fine_amount, points_deducted, status, issued_at) "
                 "VALUES (:vid, :vtype, :fine, :points, 'pending', :issued) "
                 "RETURNING id"),
            {
                "vid": vehicle_id,
                "vtype": violation_type,
                "fine": fine_amount,
                "points": points_deducted,
                "issued": now,
            }
        )
        self.db.commit()
        new_id = result.fetchone()[0]
        v = self.db.query(Violation).filter(Violation.id == new_id).first()
        return v

    def sum_points_deducted(self, vehicle_id: int) -> int:
        """Sum all points_deducted from all violations for a vehicle."""
        try:
            result = (
                self.db.query(func.coalesce(func.sum(Violation.points_deducted), 0))
                .filter(Violation.vehicle_id == vehicle_id)
                .scalar()
            )
            return int(result) if result else 0
        except Exception:
            return 0

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

    # ───── Complaints ─────

    def create_complaint(
        self,
        violation_id: int,
        user_id: int,
        full_name: str,
        citizen_id: str,
        reason: str,
        plate_number: Optional[str] = None,
        phone_number: Optional[str] = None,
        address: Optional[str] = None,
        evidence_url: Optional[str] = None,
    ) -> Complaint:
        """Create a new complaint using raw SQL."""
        from datetime import datetime
        now = datetime.utcnow()
        result = self.db.execute(
            text("INSERT INTO complaints (violation_id, full_name, citizen_id, "
                 "phone_number, address, reason, evidence_url, status, created_at) "
                 "VALUES (:vid, :name, :cid, :phone, :addr, "
                 ":reason, :evidence, 'pending', :now) RETURNING id"),
            {
                "vid": violation_id,
                "name": full_name,
                "cid": citizen_id,
                "phone": phone_number or "",
                "addr": address or "",
                "reason": reason,
                "evidence": evidence_url or "",
                "now": now,
            }
        )
        self.db.commit()
        new_id = result.fetchone()[0]
        c = Complaint(id=new_id)
        c.violation_id = violation_id
        c.user_id = user_id
        c.full_name = full_name
        c.citizen_id = citizen_id
        c.reason = reason
        c.status = "pending"
        c.created_at = now
        return c

    def list_complaints(self, user_id: Optional[int] = None) -> list[dict]:
        """List all complaints. Gets plate_number from vehicles table via JOIN."""
        base_sql = (
            "SELECT c.id, c.violation_id, "
            "COALESCE(veh.license_plate, '') as plate_number, "
            "c.full_name, c.citizen_id, c.phone_number, c.address, "
            "c.reason, c.evidence_url, c.status, c.created_at, "
            "v.violation_type, COALESCE(v.points_deducted, 0) as points_deducted, "
            "v.status as violation_status "
            "FROM complaints c "
            "JOIN violations v ON c.violation_id = v.id "
            "LEFT JOIN vehicles veh ON v.vehicle_id = veh.id "
        )

        try:
            if user_id is not None:
                result = self.db.execute(
                    text(base_sql + " WHERE c.user_id = :uid ORDER BY c.created_at DESC"),
                    {"uid": user_id}
                ).fetchall()
            else:
                result = self.db.execute(
                    text(base_sql + " ORDER BY c.created_at DESC")
                ).fetchall()
        except Exception:
            try:
                simple = (
                    "SELECT c.id, c.violation_id, "
                    "'' as plate_number, "
                    "c.full_name, c.citizen_id, c.phone_number, c.address, "
                    "c.reason, c.evidence_url, c.status, c.created_at, "
                    "v.violation_type, COALESCE(v.points_deducted, 0) as points_deducted, "
                    "v.status as violation_status "
                    "FROM complaints c "
                    "JOIN violations v ON c.violation_id = v.id "
                )
                if user_id is not None:
                    result = self.db.execute(
                        text(simple + " WHERE c.user_id = :uid ORDER BY c.created_at DESC"),
                        {"uid": user_id}
                    ).fetchall()
                else:
                    result = self.db.execute(
                        text(simple + " ORDER BY c.created_at DESC")
                    ).fetchall()
            except Exception:
                return []

        return [
            {
                "id": r[0],
                "violation_id": r[1],
                "plate_number": r[2] or "",
                "full_name": r[3],
                "citizen_id": r[4],
                "phone_number": r[5],
                "address": r[6],
                "reason": r[7],
                "evidence_url": r[8],
                "status": r[9],
                "created_at": r[10],
                "case_id": f"#KP-{r[0]:05d}",
                "violation_type": r[11] or "",
                "points_deducted": r[12] or 0,
                "violation_status": r[13] or "",
            }
            for r in result
        ]