"""
Detection service — CRUD operations for detection history with WebSocket broadcasting.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..core.exceptions import NotFoundException
from ..models.models import DetectionHistory, User
from ..repositories.detection_repository import DetectionRepository
from ..socket.manager import manager


class DetectionService:
    """Business logic for detection history management."""

    def __init__(self, db: Session) -> None:
        self.detection_repo = DetectionRepository(db)

    def list_detections(self, user_id: int) -> list[DetectionHistory]:
        """Return all detections for a specific user, ordered by id descending."""
        return self.detection_repo.find_all(user_id=user_id)

    def search_detections(
        self,
        user_id: int,
        plate_number: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        is_blacklisted: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[DetectionHistory], int]:
        """Search detections for a specific user with filters and return (items, total)."""
        return self.detection_repo.search(
            user_id=user_id,
            plate_number=plate_number,
            date_from=date_from,
            date_to=date_to,
            is_blacklisted=is_blacklisted,
            page=page,
            page_size=page_size,
        )

    def create_detection(
        self,
        user_id: int,
        plate_number: str,
        confidence: float,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: bool = False,
    ) -> DetectionHistory:
        """Create a new detection record for a user and broadcast via WebSocket."""
        detection = self.detection_repo.create(
            user_id=user_id,
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
                "user_id": user_id,
            }
        )
        return detection

    def update_detection(
        self,
        detection_id: int,
        user_id: int,
        plate_number: Optional[str] = None,
        confidence: Optional[float] = None,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: Optional[bool] = None,
    ) -> DetectionHistory:
        """Update a detection by id, scoped to user. Raises NotFoundException if not found."""
        detection = self.detection_repo.find_by_id(detection_id, user_id)
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
            {"event": "detection_updated", "detection_id": updated.id, "user_id": user_id}
        )
        return updated

    def delete_detection(self, detection_id: int, user_id: int) -> None:
        """Delete a detection by id, scoped to user. Raises NotFoundException if not found."""
        detection = self.detection_repo.find_by_id(detection_id, user_id)
        if not detection:
            raise NotFoundException(detail=f"Detection with id '{detection_id}' not found")
        self.detection_repo.delete(detection)
        manager.broadcast_event(
            {"event": "detection_deleted", "detection_id": detection_id, "user_id": user_id}
        )

    def delete_detections_bulk(self, ids: list[int], user_id: int) -> int:
        """Delete multiple detections by IDs, scoped to user. Returns number deleted."""
        return self.detection_repo.delete_by_ids(ids, user_id)

    def get_stats(self, user_id: int) -> dict:
        """Return dashboard statistics for a specific user."""
        return self.detection_repo.get_stats(user_id=user_id)

    def save_lpr_results(
        self,
        user_id: int,
        plates: list[dict],
        image_url: str | None = None,
    ) -> list[DetectionHistory]:
        """Save multiple LPR recognition results for a user and broadcast events."""
        saved = []
        for plate in plates:
            if plate.get("plate_number"):
                detection = self.detection_repo.create(
                    user_id=user_id,
                    plate_number=plate["plate_number"],
                    confidence=plate.get("confidence", 0.0),
                    image_url=image_url,
                    vehicle_type=None,
                    is_blacklisted=False,
                )
                saved.append(detection)
                manager.broadcast_event(
                    {
                        "event": "detection_created",
                        "detection_id": detection.id,
                        "plate_number": detection.plate_number,
                        "user_id": user_id,
                    }
                )
        return saved