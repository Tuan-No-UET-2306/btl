"""Service exports.

Imports are resolved lazily so importing one service module does not load the
heavy LPR models as a side effect.
"""

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


def __getattr__(name: str):
    if name == "AuthService":
        from .auth_service import AuthService

        return AuthService
    if name == "DetectionService":
        from .detection_service import DetectionService

        return DetectionService
    if name in {"LPRService", "lpr_service"}:
        from .lpr_service import LPRService, lpr_service

        return {"LPRService": LPRService, "lpr_service": lpr_service}[name]
    if name in {"MinioService", "minio_service"}:
        from .minio_service import MinioService, minio_service

        return {"MinioService": MinioService, "minio_service": minio_service}[name]
    if name == "UserService":
        from .user_service import UserService

        return UserService
    if name == "VideoService":
        from .video_service import VideoService

        return VideoService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
