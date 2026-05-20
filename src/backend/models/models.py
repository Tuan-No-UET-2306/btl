from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    blacklisted_plates = relationship("BlacklistedPlate", back_populates="creator", lazy="dynamic")


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

    creator = relationship("User", back_populates="blacklisted_plates")

    @property
    def created_by_username(self) -> str | None:
        return self.creator.username if self.creator else None


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
