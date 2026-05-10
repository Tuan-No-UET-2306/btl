"""
Global exception handlers for FastAPI application.
Provides consistent JSON error responses across all endpoints.
"""

import logging
from typing import Union

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .exceptions import AppException

logger = logging.getLogger(__name__)


def _error_response(
    code: str,
    message: str,
    status_code: int,
    errors: Union[list[dict], None] = None,
) -> JSONResponse:
    """Build a standardized JSON error response."""
    body: dict = {
        "success": False,
        "code": code,
        "message": message,
    }
    if errors:
        body["errors"] = errors
    return JSONResponse(status_code=status_code, content=body)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle all custom AppException subclasses."""
    logger.warning(
        "AppException: code=%s, detail=%s, path=%s",
        exc.code,
        exc.detail,
        request.url.path,
    )
    return _error_response(
        code=exc.code,
        message=exc.detail,
        status_code=exc.status_code,
    )


async def starlette_http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle Starlette/FastAPI HTTPException."""
    logger.warning(
        "HTTPException: status=%d, detail=%s, path=%s",
        exc.status_code,
        exc.detail,
        request.url.path,
    )
    return _error_response(
        code="http_error",
        message=str(exc.detail),
        status_code=exc.status_code,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic/FastAPI request validation errors."""
    errors = []
    for err in exc.errors():
        errors.append(
            {
                "field": ".".join(str(loc) for loc in err.get("loc", [])),
                "message": err.get("msg", ""),
                "type": err.get("type", ""),
            }
        )
    logger.warning(
        "ValidationError: path=%s, errors=%s",
        request.url.path,
        errors,
    )
    return _error_response(
        code="validation_error",
        message="Request validation failed",
        status_code=422,
        errors=errors,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for any unhandled exception (500)."""
    logger.exception(
        "Unhandled exception: path=%s, error=%s",
        request.url.path,
        str(exc),
    )
    return _error_response(
        code="internal_error",
        message="An unexpected error occurred",
        status_code=500,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app."""
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(StarletteHTTPException, starlette_http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)