from .auth_service import AuthService
from .detection_service import DetectionService
from .lpr_service import LPRService, lpr_service
from .minio_service import MinioService, minio_service
from .user_service import UserService
from .video_service import VideoService

__all__ = [
    "AuthService",
    "DetectionService",
    "LPRService",
    "lpr_service",
    "MinioService",
    "minio_service",
    "UserService",
    "VideoService",
]