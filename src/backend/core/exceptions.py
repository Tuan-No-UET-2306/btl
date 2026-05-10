"""
Custom exception classes for standardized error handling.
All exceptions carry a `code` (machine-readable string) and `detail` (human-readable message).
"""

from typing import Any, Optional


class AppException(Exception):
    """Base exception for all application-level errors."""

    def __init__(
        self,
        code: str = "internal_error",
        detail: str = "An internal error occurred",
        status_code: int = 500,
        headers: Optional[dict[str, str]] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        self.code = code
        self.detail = detail
        self.status_code = status_code
        self.headers = headers
        self.payload = payload
        super().__init__(detail)


class NotFoundException(AppException):
    def __init__(
        self,
        detail: str = "Resource not found",
        code: str = "not_found",
        **kwargs: Any,
    ) -> None:
        super().__init__(code=code, detail=detail, status_code=404, **kwargs)


class ConflictException(AppException):
    def __init__(
        self,
        detail: str = "Resource already exists",
        code: str = "conflict",
        **kwargs: Any,
    ) -> None:
        super().__init__(code=code, detail=detail, status_code=409, **kwargs)


class UnauthorizedException(AppException):
    def __init__(
        self,
        detail: str = "Unauthorized",
        code: str = "unauthorized",
        **kwargs: Any,
    ) -> None:
        super().__init__(code=code, detail=detail, status_code=401, **kwargs)


class ForbiddenException(AppException):
    def __init__(
        self,
        detail: str = "Forbidden",
        code: str = "forbidden",
        **kwargs: Any,
    ) -> None:
        super().__init__(code=code, detail=detail, status_code=403, **kwargs)


class BadRequestException(AppException):
    def __init__(
        self,
        detail: str = "Bad request",
        code: str = "bad_request",
        **kwargs: Any,
    ) -> None:
        super().__init__(code=code, detail=detail, status_code=400, **kwargs)


class ValidationException(AppException):
    def __init__(
        self,
        detail: str = "Validation failed",
        code: str = "validation_error",
        errors: Optional[list[dict[str, Any]]] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(code=code, detail=detail, status_code=422, **kwargs)
        self.errors = errors or []