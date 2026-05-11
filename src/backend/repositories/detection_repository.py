"""
Detection repository — encapsulates all DetectionHistory model database operations.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import func
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

    def search(
        self,
        plate_number: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        is_blacklisted: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[DetectionHistory], int]:
        """
        Search detections with filters and pagination.
        Returns (items, total_count).
        """
        query = self.db.query(DetectionHistory)

        if plate_number:
            query = query.filter(DetectionHistory.plate_number.ilike(f"%{plate_number}%"))
        if date_from:
            query = query.filter(DetectionHistory.created_at >= date_from)
        if date_to:
            query = query.filter(DetectionHistory.created_at <= date_to)
        if is_blacklisted is not None:
            query = query.filter(DetectionHistory.is_blacklisted == is_blacklisted)

        total = query.count()
        query = query.order_by(DetectionHistory.id.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        return query.all(), total

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

    def delete_by_ids(self, ids: list[int]) -> int:
        """Delete multiple detections by IDs. Returns number of deleted rows."""
        result = self.db.query(DetectionHistory).filter(DetectionHistory.id.in_(ids)).delete(synchronize_session=False)
        self.db.commit()
        return result

    def get_stats(self) -> dict:
        """Return dashboard statistics."""
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)

        total = self.db.query(func.count(DetectionHistory.id)).scalar() or 0
        today = self.db.query(func.count(DetectionHistory.id)).filter(
            DetectionHistory.created_at >= today_start
        ).scalar() or 0
        this_week = self.db.query(func.count(DetectionHistory.id)).filter(
            DetectionHistory.created_at >= week_start
        ).scalar() or 0
        blacklisted = self.db.query(func.count(DetectionHistory.id)).filter(
            DetectionHistory.is_blacklisted == True
        ).scalar() or 0

        # Top 10 plates
        top_plates = (
            self.db.query(
                DetectionHistory.plate_number,
                func.count(DetectionHistory.id).label("count"),
            )
            .group_by(DetectionHistory.plate_number)
            .order_by(func.count(DetectionHistory.id).desc())
            .limit(10)
            .all()
        )

        # Detection count per day for last 7 days
        daily_counts = []
        for i in range(6, -1, -1):
            day = today_start - timedelta(days=i)
            next_day = day + timedelta(days=1)
            count = self.db.query(func.count(DetectionHistory.id)).filter(
                DetectionHistory.created_at >= day,
                DetectionHistory.created_at < next_day,
            ).scalar() or 0
            daily_counts.append({
                "date": day.strftime("%Y-%m-%d"),
                "count": count,
            })

        return {
            "total": total,
            "today": today,
            "this_week": this_week,
            "blacklisted": blacklisted,
            "top_plates": [
                {"plate_number": p[0], "count": p[1]} for p in top_plates
            ],
            "daily_counts": daily_counts,
        }
