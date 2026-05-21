from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BlacklistedPlate(Base):
    __tablename__ = "blacklisted_plates"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(32), unique=True, nullable=False, index=True)
    reason = Column(Text, nullable=True)
    created_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DetectionHistory(Base):
    __tablename__ = "detection_histories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plate_number = Column(String(32), nullable=False, index=True)
    vehicle_type = Column(String(32), nullable=True)
    confidence = Column(Float, nullable=False)
    image_url = Column(String(512), nullable=True)
    is_blacklisted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UploadedVideo(Base):
    __tablename__ = "uploaded_videos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    video_url = Column(String(500), nullable=False)
    processed_video_url = Column(String(500), nullable=True)
    filename = Column(String(255), nullable=True)
    status = Column(String(20), nullable=True, default="queued")
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


class VideoDetection(Base):
    __tablename__ = "video_detections"

    id = Column(Integer, primary_key=True, index=True)
    uploaded_video_id = Column(
        Integer,
        ForeignKey("uploaded_videos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plate_number = Column(String(32), nullable=False, index=True)
    confidence = Column(Float, nullable=False)
    frame_number = Column(Integer, nullable=True)
    timestamp_seconds = Column(Float, nullable=True)
    bbox_x1 = Column(Integer, nullable=True)
    bbox_y1 = Column(Integer, nullable=True)
    bbox_x2 = Column(Integer, nullable=True)
    bbox_y2 = Column(Integer, nullable=True)
    frame_width = Column(Integer, nullable=True)
    frame_height = Column(Integer, nullable=True)
    image_url = Column(String(512), nullable=True)
    is_blacklisted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def bbox(self) -> list[int] | None:
        values = (self.bbox_x1, self.bbox_y1, self.bbox_x2, self.bbox_y2)
        if any(value is None for value in values):
            return None
        return [int(value) for value in values]


# ────────────────────────────── Owner (chủ xe) ──────────────────────────────
class Owner(Base):
    __tablename__ = "owners"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    citizen_id = Column(String(20), unique=True, nullable=False, index=True)
    phone_number = Column(String(15), nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ────────────────────────────── Vehicle (phương tiện) ──────────────────────────────
class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    license_plate = Column(String(20), unique=True, nullable=False, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("owners.id", ondelete="SET NULL"),
        nullable=True,
    )
    vehicle_type = Column(String(50), nullable=True)
    brand = Column(String(50), nullable=True)
    color = Column(String(30), nullable=True)
    registered_date = Column(DateTime, nullable=True)
    is_blacklist = Column(Integer, default=0)  # 0 = normal, 1 = blacklisted
    blacklist_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    owner = None  # Will be set by SQLAlchemy join in queries


# ────────────────────────────── Violation (vi phạm) ──────────────────────────────
class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(
        Integer,
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    violation_type = Column(String(100), nullable=False)
    fine_amount = Column(Numeric(10, 2), nullable=True)
    points_deducted = Column(Integer, default=0)  # Số điểm bị trừ
    status = Column(String(20), default="pending")  # pending, approved, rejected
    issued_at = Column(DateTime(timezone=True), server_default=func.now())


# ────────────────────────────── Complaint (khiếu nại) ──────────────────────────────
class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(
        Integer,
        ForeignKey("violations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    full_name = Column(String(100), nullable=False)
    citizen_id = Column(String(20), nullable=False)
    phone_number = Column(String(15), nullable=True)
    address = Column(Text, nullable=True)
    reason = Column(Text, nullable=False)
    evidence_url = Column(String(512), nullable=True)
    status = Column(String(20), default="pending")  # pending, approved, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())