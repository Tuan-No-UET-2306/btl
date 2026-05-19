"""
Blacklist repository — encapsulates BlacklistedPlate database operations.
"""
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ..models.models import BlacklistedPlate, User


class BlacklistRepository:
    """Data access layer for BlacklistedPlate entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_by_id(self, blacklist_id: int) -> Optional[BlacklistedPlate]:
        return (
            self.db.query(BlacklistedPlate)
            .options(joinedload(BlacklistedPlate.creator))
            .filter(BlacklistedPlate.id == blacklist_id)
            .first()
        )

    def find_by_plate_number(self, plate_number: str) -> Optional[BlacklistedPlate]:
        return (
            self.db.query(BlacklistedPlate)
            .options(joinedload(BlacklistedPlate.creator))
            .filter(BlacklistedPlate.plate_number == plate_number)
            .first()
        )

    def find_all(self) -> list[BlacklistedPlate]:
        return (
            self.db.query(BlacklistedPlate)
            .options(joinedload(BlacklistedPlate.creator))
            .order_by(BlacklistedPlate.created_at.desc())
            .all()
        )

    def create(
        self,
        plate_number: str,
        reason: Optional[str] = None,
        created_by: Optional[int] = None,
    ) -> BlacklistedPlate:
        entry = BlacklistedPlate(
            plate_number=plate_number,
            reason=reason,
            created_by=created_by,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        # Eager load creator after refresh
        self.db.refresh(entry, attribute_names=["creator"])
        return entry

    def update(
        self,
        entry: BlacklistedPlate,
        plate_number: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> BlacklistedPlate:
        if plate_number is not None:
            entry.plate_number = plate_number
        if reason is not None:
            entry.reason = reason
        self.db.commit()
        self.db.refresh(entry)
        self.db.refresh(entry, attribute_names=["creator"])
        return entry

    def delete(self, entry: BlacklistedPlate) -> None:
        self.db.delete(entry)
        self.db.commit()
