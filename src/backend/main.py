import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram, Gauge, generate_latest, REGISTRY
from prometheus_fastapi_instrumentator import Instrumentator
import psutil
from sqlalchemy.orm import Session

from .api.router import api_router
from .core.config import CORS_ORIGINS
from .core.exception_handlers import register_exception_handlers
from .core.security import hash_password
from .models.database import Base, engine, ensure_schema, SessionLocal
from .models.models import User
from .services.minio_service import minio_service
from .socket.manager import manager

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------
class StructuredFormatter(logging.Formatter):
    """Formats log records as JSON for machine-parsable output."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt or "%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Include exception info if present
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        # Include extra fields that were passed via the `extra` parameter
        for key in ("endpoint", "client_ip", "method", "status_code"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)
        return json.dumps(log_entry, default=str)


_handler = logging.StreamHandler()
_handler.setFormatter(StructuredFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prometheus custom metrics
# ---------------------------------------------------------------------------
HTTP_REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total number of HTTP requests",
    ["method", "endpoint", "http_status"],
)
HTTP_REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0),
)
ERROR_COUNT = Counter(
    "http_errors_total",
    "Total number of HTTP 5xx errors",
    ["method", "endpoint"],
)
ACTIVE_WS_CONNECTIONS = Gauge(
    "active_websocket_connections",
    "Number of currently active WebSocket connections",
)
SYSTEM_CPU_USAGE = Gauge("system_cpu_usage_percent", "Current CPU usage in percent")
SYSTEM_MEMORY_USAGE = Gauge(
    "system_memory_usage_bytes",
    "Current memory usage in bytes",
    ["type"],  # 'used', 'total', 'available'
)

app = FastAPI(title="LPR System API")

# Register global exception handlers
register_exception_handlers(app)


def seed_admin_user() -> None:
    """Create a default admin user if none exists."""
    db: Session = SessionLocal()
    try:
        from sqlalchemy import inspect as sa_inspect, text
        inspector = sa_inspect(engine)
        if "users" in inspector.get_table_names():
            user_columns = {col["name"] for col in inspector.get_columns("users")}
            if "role" not in user_columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user'"))
                    logger.info("Added 'role' column to users table on startup")
        
        admin = db.query(User).filter(User.role == "admin").first()
        if admin:
            logger.info("Admin user already exists: %s (role=%s)", admin.username, admin.role)
            return

        # Check if there's a user named 'admin' but with wrong role
        existing_admin_user = db.query(User).filter(User.username == "admin").first()
        if existing_admin_user and existing_admin_user.role != "admin":
            existing_admin_user.role = "admin"
            db.commit()
            logger.info("Upgraded user 'admin' to admin role")
            return

        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        hashed = hash_password(admin_password)
        admin_user = User(
            username=admin_username,
            hashed_password=hashed,
            role="admin",
            is_active=True,
        )
        db.add(admin_user)
        db.commit()
        logger.info(
            "Created default admin user: username=%s, password=%s",
            admin_username,
            admin_password,
        )
    except Exception as e:
        logger.warning("Failed to seed admin user: %s", e)
    finally:
        db.close()


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("Running startup initialization...")
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    seed_admin_user()
    minio_service.ensure_bucket()
    manager.start_redis_listener()
    logger.info("Startup complete.")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await manager.stop_redis_listener()


@app.get("/debug/users")
def debug_users(local_kw: str = None, db: Session = Depends(SessionLocal)):
    """Debug endpoint: show all users with their roles."""
    try:
        users = db.query(User).all()
        return {
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "role": u.role,
                    "is_active": u.is_active,
                }
                for u in users
            ],
            "total": len(users),
        }
    finally:
        db.close()


@app.post("/debug/set-admin/{user_id}")
def debug_set_admin(user_id: int, db: Session = Depends(SessionLocal)):
    """Debug endpoint: set a user's role to admin."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "User not found"}
        user.role = "admin"
        db.commit()
        logger.info("User %s (id=%s) has been promoted to admin", user.username, user.id)
        return {
            "message": f"User '{user.username}' is now admin",
            "user": {"id": user.id, "username": user.username, "role": user.role},
        }
    finally:
        db.close()


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "version": "1.0"}


# ---------------------------------------------------------------------------
# Prometheus /metrics endpoint
# ---------------------------------------------------------------------------
@app.get("/metrics")
def metrics():
    """Expose Prometheus metrics."""
    return generate_latest(REGISTRY)


# ---------------------------------------------------------------------------
# Middleware: collect custom HTTP metrics and structured logging extras
# ---------------------------------------------------------------------------
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start_time

    # Extract a clean endpoint pattern from the request URL
    endpoint = request.url.path
    method = request.method
    status_code = response.status_code

    # Record custom metrics
    HTTP_REQUEST_COUNT.labels(method=method, endpoint=endpoint, http_status=status_code).inc()
    HTTP_REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(elapsed)
    if status_code >= 500:
        ERROR_COUNT.labels(method=method, endpoint=endpoint).inc()

    # Structured logging with extra context
    logger.info(
        "request handled",
        extra={
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "client_ip": request.client.host if request.client else "unknown",
        },
    )
    return response


# ---------------------------------------------------------------------------
# System metrics background task (updates CPU & memory every 15 s)
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def start_system_metrics_collector():
    """Periodically updates system resource gauges."""

    async def _collect():
        while True:
            try:
                cpu_percent = psutil.cpu_percent(interval=1)
                SYSTEM_CPU_USAGE.set(cpu_percent)

                mem = psutil.virtual_memory()
                SYSTEM_MEMORY_USAGE.labels(type="total").set(mem.total)
                SYSTEM_MEMORY_USAGE.labels(type="used").set(mem.used)
                SYSTEM_MEMORY_USAGE.labels(type="available").set(mem.available)
            except Exception:
                logger.warning("Failed to collect system metrics", exc_info=True)
            await asyncio.sleep(15)

    import asyncio

    asyncio.create_task(_collect())


# ---------------------------------------------------------------------------
# Instrumentator: auto-instrument FastAPI for default Prometheus metrics
# (endpoint is not exposed here because we serve /metrics ourselves)
# ---------------------------------------------------------------------------
instrumentator = Instrumentator()
instrumentator.instrument(app)

app.include_router(api_router, prefix="/api/v1")
