"""
Detection service — CRUD operations for detection history with WebSocket broadcasting.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..core.exceptions import NotFoundException
from ..models.models import DetectionHistory
from ..repositories.detection_repository import DetectionRepository
from ..socket.manager import manager


class DetectionService:
    """Business logic for detection history management."""

    def __init__(self, db: Session) -> None:
        self.detection_repo = DetectionRepository(db)

    def list_detections(self) -> list[DetectionHistory]:
        """Return all detections ordered by id descending."""
        return self.detection_repo.find_all()

    def create_detection(
        self,
        plate_number: str,
        confidence: float,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: bool = False,
    ) -> DetectionHistory:
        """Create a new detection record and broadcast via WebSocket."""
        detection = self.detection_repo.create(
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            vehicle_type=vehicle_type,
            is_blacklisted=is_blacklisted,
        )
        manager.broadcast_event(
            {
                "event": "detection_created",
                "detection_id": detection.id,
                "plate_number": detection.plate_number,
            }
        )
        return detection

    def update_detection(
        self,
        detection_id: int,
        plate_number: Optional[str] = None,
        confidence: Optional[float] = None,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: Optional[bool] = None,
    ) -> DetectionHistory:
        """Update a detection by id. Raises NotFoundException if not found."""
        detection = self.detection_repo.find_by_id(detection_id)
        if not detection:
            raise NotFoundException(detail=f"Detection with id '{detection_id}' not found")

        updated = self.detection_repo.update(
            detection,
            plate_number=plate_number,
            confidence=confidence,
            image_url=image_url,
            vehicle_type=vehicle_type,
            is_blacklisted=is_blacklisted,
        )
        manager.broadcast_event(
            {"event": "detection_updated", "detection_id": updated.id}
        )
        return updated

    def delete_detection(self, detection_id: int) -> None:
        """Delete a detection by id. Raises NotFoundException if not found."""
        detection = self.detection_repo.find_by_id(detection_id)
        if not detection:
            raise NotFoundException(detail=f"Detection with id '{detection_id}' not found")
        self.detection_repo.delete(detection)
        manager.broadcast_event(
            {"event": "detection_deleted", "detection_id": detection_id}
        )

    def save_lpr_results(
        self,
        plates: list[dict],
    ) -> list[DetectionHistory]:
        """Save multiple LPR recognition results and broadcast events."""
        saved = []
        for plate in plates:
            if plate.get("plate_number"):
                detection = self.detection_repo.create(
                    plate_number=plate["plate_number"],
                    confidence=plate.get("confidence", 0.0),
                    image_url=None,
                    vehicle_type=None,
                    is_blacklisted=False,
                )
                saved.append(detection)
                manager.broadcast_event(
                    {
                        "event": "detection_created",
                        "detection_id": detection.id,
                        "plate_number": detection.plate_number,
                    }
                )
        return saved