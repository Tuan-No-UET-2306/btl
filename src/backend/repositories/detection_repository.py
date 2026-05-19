"""
Detection repository — encapsulates all DetectionHistory model database operations.
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, String
from sqlalchemy.orm import Session

from ..models.models import BlacklistedPlate, DetectionHistory, UploadedVideo, VideoDetection


class DetectionRepository:
    """Data access layer for DetectionHistory entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_by_id(self, detection_id: int, user_id: int) -> Optional[DetectionHistory]:
        return (
            self.db.query(DetectionHistory)
            .filter(DetectionHistory.id == detection_id, DetectionHistory.user_id == user_id)
            .first()
        )

    def find_all(self, user_id: int) -> list[DetectionHistory]:
        return (
            self.db.query(DetectionHistory)
            .filter(DetectionHistory.user_id == user_id)
            .order_by(DetectionHistory.id.desc())
            .all()
        )

    def search(
        self,
        user_id: int,
        plate_number: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        is_blacklisted: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[DetectionHistory], int]:
        """
        Search detections for a specific user with filters and pagination.
        Returns (items, total_count).
        """
        query = self.db.query(DetectionHistory).filter(DetectionHistory.user_id == user_id)

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
        user_id: int,
        plate_number: str,
        confidence: float,
        image_url: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        is_blacklisted: bool = False,
    ) -> DetectionHistory:
        detection = DetectionHistory(
            user_id=user_id,
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

    def delete_by_ids(self, ids: list[int], user_id: int) -> int:
        """Delete multiple detections by IDs, scoped to user. Returns number of deleted rows."""
        result = (
            self.db.query(DetectionHistory)
            .filter(DetectionHistory.id.in_(ids), DetectionHistory.user_id == user_id)
            .delete(synchronize_session=False)
        )
        self.db.commit()
        return result

    def search_all(
        self,
        user_id: int,
        plate_number: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        is_blacklisted: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        """Search ALL detections (LPR + Video) with filters and pagination, scoped to user."""
        # Query DetectionHistory (LPR)
        dh_query = self.db.query(
            DetectionHistory.id,
            DetectionHistory.plate_number,
            DetectionHistory.confidence,
            DetectionHistory.vehicle_type,
            DetectionHistory.image_url,
            DetectionHistory.is_blacklisted,
            DetectionHistory.created_at,
            DetectionHistory.user_id,
        ).filter(DetectionHistory.user_id == user_id)

        # Query VideoDetection (video)
        vd_query = self.db.query(
            VideoDetection.id,
            VideoDetection.plate_number,
            VideoDetection.confidence,
            func.cast(func.null(), String).label("vehicle_type"),
            VideoDetection.image_url,
            VideoDetection.is_blacklisted,
            VideoDetection.created_at,
            UploadedVideo.user_id,
        ).join(UploadedVideo, VideoDetection.uploaded_video_id == UploadedVideo.id).filter(UploadedVideo.user_id == user_id)

        if plate_number:
            dh_query = dh_query.filter(DetectionHistory.plate_number.ilike(f"%{plate_number}%"))
            vd_query = vd_query.filter(VideoDetection.plate_number.ilike(f"%{plate_number}%"))
        if date_from:
            dh_query = dh_query.filter(DetectionHistory.created_at >= date_from)
            vd_query = vd_query.filter(VideoDetection.created_at >= date_from)
        if date_to:
            dh_query = dh_query.filter(DetectionHistory.created_at <= date_to)
            vd_query = vd_query.filter(VideoDetection.created_at <= date_to)
        if is_blacklisted is not None:
            dh_query = dh_query.filter(DetectionHistory.is_blacklisted == is_blacklisted)
            vd_query = vd_query.filter(VideoDetection.is_blacklisted == is_blacklisted)

        # Fetch both result sets
        dh_results = dh_query.order_by(DetectionHistory.created_at.desc()).all()
        vd_results = vd_query.order_by(VideoDetection.created_at.desc()).all()

        # Merge and sort by created_at desc
        combined = []
        for r in dh_results:
            combined.append({
                "id": r.id,
                "plate_number": r.plate_number,
                "confidence": r.confidence,
                "vehicle_type": r.vehicle_type,
                "image_url": r.image_url,
                "is_blacklisted": r.is_blacklisted,
                "created_at": r.created_at,
                "source": "lpr",
            })
        for r in vd_results:
            combined.append({
                "id": r.id,
                "plate_number": r.plate_number,
                "confidence": r.confidence,
                "vehicle_type": r.vehicle_type,
                "image_url": r.image_url,
                "is_blacklisted": r.is_blacklisted,
                "created_at": r.created_at,
                "source": "video",
            })

        combined.sort(key=lambda x: x["created_at"] or datetime.min, reverse=True)
        total = len(combined)

        # Paginate
        start = (page - 1) * page_size
        end = start + page_size
        page_items = combined[start:end]

        return page_items, total

    def get_stats(self, user_id: int) -> dict:
        """Return dashboard statistics for a specific user."""
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)

        # DetectionHistory stats (from LPR)
        dh_query = self.db.query(DetectionHistory).filter(DetectionHistory.user_id == user_id)
        dh_today = dh_query.filter(DetectionHistory.created_at >= today_start).count()
        dh_this_week = dh_query.filter(DetectionHistory.created_at >= week_start).count()

        # VideoDetection stats (from video processing) — via UploadedVideo.user_id
        vd_query = self.db.query(VideoDetection).join(
            UploadedVideo, VideoDetection.uploaded_video_id == UploadedVideo.id
        ).filter(UploadedVideo.user_id == user_id)
        vd_today = vd_query.filter(VideoDetection.created_at >= today_start).count()
        vd_this_week = vd_query.filter(VideoDetection.created_at >= week_start).count()

        # Combine detection counts
        total = dh_query.count() + vd_query.count()
        today = dh_today + vd_today
        this_week = dh_this_week + vd_this_week

        # Blacklist count from BlacklistedPlate table (more accurate)
        blacklisted = self.db.query(BlacklistedPlate).count()

        # Video count for this user in last 7 days
        videos_this_week = (
            self.db.query(UploadedVideo)
            .filter(
                UploadedVideo.user_id == user_id,
                UploadedVideo.uploaded_at >= week_start,
            )
            .count()
        )

        # Top 10 plates for this user (from both DetectionHistory and VideoDetection)
        top_dh = (
            self.db.query(
                DetectionHistory.plate_number,
                func.count(DetectionHistory.id).label("count"),
            )
            .filter(DetectionHistory.user_id == user_id)
            .group_by(DetectionHistory.plate_number)
            .order_by(func.count(DetectionHistory.id).desc())
            .limit(10)
            .all()
        )
        top_vd = (
            self.db.query(
                VideoDetection.plate_number,
                func.count(VideoDetection.id).label("count"),
            )
            .join(UploadedVideo, VideoDetection.uploaded_video_id == UploadedVideo.id)
            .filter(UploadedVideo.user_id == user_id)
            .group_by(VideoDetection.plate_number)
            .order_by(func.count(VideoDetection.id).desc())
            .limit(10)
            .all()
        )
        # Merge top plates
        merged_top = {}
        for p, c in top_dh:
            merged_top[p] = merged_top.get(p, 0) + c
        for p, c in top_vd:
            merged_top[p] = merged_top.get(p, 0) + c
        sorted_top = sorted(merged_top.items(), key=lambda x: -x[1])[:10]
        top_plates = [{"plate_number": p, "count": c} for p, c in sorted_top]

        # Detection count per day for last 7 days for this user
        daily_counts = []
        for i in range(6, -1, -1):
            day = today_start - timedelta(days=i)
            next_day = day + timedelta(days=1)

            dh_day = (
                self.db.query(func.count(DetectionHistory.id))
                .filter(
                    DetectionHistory.user_id == user_id,
                    DetectionHistory.created_at >= day,
                    DetectionHistory.created_at < next_day,
                )
                .scalar()
                or 0
            )
            vd_day = (
                self.db.query(func.count(VideoDetection.id))
                .join(UploadedVideo, VideoDetection.uploaded_video_id == UploadedVideo.id)
                .filter(
                    UploadedVideo.user_id == user_id,
                    VideoDetection.created_at >= day,
                    VideoDetection.created_at < next_day,
                )
                .scalar()
                or 0
            )
            daily_counts.append({
                "date": day.strftime("%Y-%m-%d"),
                "count": dh_day + vd_day,
            })

        return {
            "total": total,
            "today": today,
            "this_week": this_week,
            "blacklisted": blacklisted,
            "videos_this_week": videos_this_week,
            "top_plates": top_plates,
            "daily_counts": daily_counts,
        }
