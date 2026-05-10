"""
Detection repository — encapsulates all DetectionHistory model database operations.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import DetectionHistory


class DetectionRepository:
    """Data access layer for DetectionHistory entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_by_id(self, detection_id: int) -> Optional[DetectionHistory]:
        return self.db.query(DetectionHistory).filter(DetectionHistory.id == detection_id).first()

    def find_all(self) -> list[DetectionHistory]:
        return self.db.query(DetectionHistory).order_by(DetectionHistory.id.desc()).all()

    def create(
        self,
        plate_number: str,
        confidence: float,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: bool = False,
    ) -> DetectionHistory:
        detection = DetectionHistory(
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            vehicle_type=vehicle_type,
            is_blacklisted=is_blacklisted,
        )
        self.db.add(detection)
        self.db.commit()
        self.db.refresh(detection)
        return detection

    def update(
        self,
        detection: DetectionHistory,
        plate_number: Optional[str] = None,
        confidence: Optional[float] = None,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: Optional[bool] = None,
    ) -> DetectionHistory:
        if plate_number is not None:
            detection.plate_number = plate_number
        if confidence is not None:
            detection.confidence = confidence
        if image_url is not None:
            detection.image_url = image_url
        if vehicle_type is not None:
            detection.vehicle_type = vehicle_type
        if is_blacklisted is not None:
            detection.is_blacklisted = is_blacklisted
        self.db.commit()
        self.db.refresh(detection)
        return detection

    def delete(self, detection: DetectionHistory) -> None:
        self.db.delete(detection)
        self.db.commit()