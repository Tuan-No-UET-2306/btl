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


# ────────────────────────────── Blacklisted Plate ──────────────────────────────


class BlacklistedPlateCreate(BaseModel):
    plate_number: str
    reason: Optional[str] = None


class BlacklistedPlateUpdate(BaseModel):
    reason: Optional[str] = None


class BlacklistedPlateResponse(BaseSchema):
    id: int
    plate_number: str
    reason: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime


# ────────────────────────────── Detection ──────────────────────────────


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
    user_id: int
    plate_number: str
    confidence: float
    image_url: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_blacklisted: bool
    created_at: datetime


class DetectionSearchParams(BaseModel):
    plate_number: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    is_blacklisted: Optional[bool] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class PaginatedDetectionResponse(BaseModel):
    items: list[DetectionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ────────────────────────────── Video ──────────────────────────────


class VideoUploadResponse(BaseSchema):
    id: int
    user_id: int
    video_url: str
    processed_video_url: Optional[str] = None
    filename: Optional[str] = None
    status: Optional[str] = None
    uploaded_at: datetime


class VideoResponse(BaseSchema):
    id: int
    user_id: int
    video_url: str
    processed_video_url: Optional[str] = None
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
    bbox: Optional[list[int]] = Field(default=None, min_length=4, max_length=4)
    frame_width: Optional[int] = None
    frame_height: Optional[int] = None
    is_blacklisted: bool = False


class VideoDetectionResponse(BaseSchema):
    id: int
    uploaded_video_id: int
    plate_number: str
    confidence: float
    image_url: Optional[str] = None
    frame_number: Optional[int] = None
    timestamp_seconds: Optional[float] = None
    bbox: Optional[list[int]] = None
    frame_width: Optional[int] = None
    frame_height: Optional[int] = None
    is_blacklisted: bool
    created_at: datetime


class VideoDetailResponse(VideoResponse):
    detections: list[VideoDetectionResponse] = []


# ────────────────────────────── Traffic / Violation ──────────────────────────────


class TrafficLookupResponse(BaseModel):
    """Response for license plate lookup."""
    plate_number: str
    is_blacklisted: bool
    blacklist_reason: Optional[str] = None
    owner_name: Optional[str] = None
    owner_citizen_id: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_brand: Optional[str] = None
    vehicle_color: Optional[str] = None
    total_points_deducted: int = 0
    points_remaining: int = 12  # Max 12 points
    violations: list["ViolationInfo"] = []


class ViolationInfo(BaseModel):
    """Individual violation info."""
    id: int
    violation_type: str
    fine_amount: Optional[float] = None
    points_deducted: int = 0
    status: str
    issued_at: Optional[datetime] = None


class ComplaintCreate(BaseModel):
    violation_id: int
    full_name: str
    citizen_id: str
    phone_number: Optional[str] = None
    address: Optional[str] = None
    reason: str
    evidence_url: Optional[str] = None


class ComplaintResponse(BaseSchema):
    id: int
    violation_id: int
    full_name: str
    citizen_id: str
    phone_number: Optional[str] = None
    address: Optional[str] = None
    reason: str
    evidence_url: Optional[str] = None
    status: str
    created_at: datetime
    case_id: str = ""  # Format: #KP-XXXXX


class ViolationCreate(BaseModel):
    """Admin creates a new violation for a vehicle."""
    license_plate: str
    violation_type: str
    points_deducted: int = Field(..., ge=2, le=10)
    fine_amount: Optional[float] = None


class ComplaintStatusUpdate(BaseModel):
    """Admin updates the status of a complaint (approve/reject)."""
    status: str = Field(..., pattern="^(approved|rejected)$")


class ViolationUpdate(BaseModel):
    """Admin updates violation details."""
    violation_type: Optional[str] = None
    points_deducted: Optional[int] = Field(default=None, ge=2, le=10)
    fine_amount: Optional[float] = None
    status: Optional[str] = None
