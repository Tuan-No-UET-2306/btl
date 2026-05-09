from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseSchema):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime


class DetectionCreate(BaseModel):
    plate_number: str
    confidence: float = Field(..., ge=0, le=1)
    image_url: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_blacklisted: bool = False


class DetectionUpdate(BaseModel):
    plate_number: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    image_url: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_blacklisted: Optional[bool] = None


class DetectionResponse(BaseSchema):
    id: int
    plate_number: str
    confidence: float
    image_url: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_blacklisted: bool
    created_at: datetime


class VideoUploadResponse(BaseSchema):
    id: int
    user_id: int
    video_url: str
    filename: Optional[str] = None
    status: Optional[str] = None
    uploaded_at: datetime


class VideoResponse(BaseSchema):
    id: int
    user_id: int
    video_url: str
    filename: Optional[str] = None
    status: Optional[str] = None
    uploaded_at: datetime
    detections_count: int = 0


class VideoProcessRequest(BaseModel):
    create_demo_detection: bool = True
    plate_number: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class VideoDetectionCreate(BaseModel):
    plate_number: str
    confidence: float = Field(..., ge=0, le=1)
    image_url: Optional[str] = None
    frame_number: Optional[int] = None
    timestamp_seconds: Optional[float] = None
    is_blacklisted: bool = False


class VideoDetectionResponse(BaseSchema):
    id: int
    uploaded_video_id: int
    plate_number: str
    confidence: float
    image_url: Optional[str] = None
    frame_number: Optional[int] = None
    timestamp_seconds: Optional[float] = None
    is_blacklisted: bool
    created_at: datetime


class VideoDetailResponse(VideoResponse):
    detections: list[VideoDetectionResponse] = []
