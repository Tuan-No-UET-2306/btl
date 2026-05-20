import logging
import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .api.router import api_router
from .core.config import CORS_ORIGINS
from .core.exception_handlers import register_exception_handlers
from .core.security import hash_password
from .models.database import Base, engine, ensure_schema, SessionLocal
from .models.models import User
from .services.minio_service import minio_service
from .socket.manager import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

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


app.include_router(api_router, prefix="/api/v1")