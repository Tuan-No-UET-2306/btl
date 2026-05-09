import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from ..core.config import DATABASE_URL

logger = logging.getLogger(__name__)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _ensure_user_schema(inspector) -> None:
    """Ensure users table has all required columns (for pre-existing DB)."""
    if "users" not in inspector.get_table_names():
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}

    with engine.begin() as connection:
        # Fix hashed_password
        if "hashed_password" not in user_columns:
            if "password_hash" in user_columns:
                connection.execute(text("ALTER TABLE users RENAME COLUMN password_hash TO hashed_password"))
            elif "hash_password" in user_columns:
                connection.execute(text("ALTER TABLE users RENAME COLUMN hash_password TO hashed_password"))
            else:
                connection.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255) NOT NULL DEFAULT ''"))

        # Fix role column
        if "role" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user'"))

        # Fix is_active column
        if "is_active" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE"))

        # Fix created_at column
        if "created_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ DEFAULT now()"))

        # Fix email column: old schema has email NOT NULL but model doesn't use it
        if "email" in user_columns:
            col_info = [c for c in inspector.get_columns("users") if c["name"] == "email"]
            if col_info and col_info[0].get("nullable", True) is False:
                connection.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL"))
                connection.execute(text("ALTER TABLE users ALTER COLUMN email SET DEFAULT ''"))
                logger.info("Fixed users.email: dropped NOT NULL, set DEFAULT ''")


def _ensure_video_schema(inspector) -> None:
    """Ensure uploaded_videos table has uploaded_at column."""
    if "uploaded_videos" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("uploaded_videos")}
    if "uploaded_at" in columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE uploaded_videos "
                "ADD COLUMN uploaded_at TIMESTAMPTZ DEFAULT now()"
            )
        )
        connection.execute(
            text("UPDATE uploaded_videos SET uploaded_at = now() WHERE uploaded_at IS NULL")
        )


def ensure_schema() -> None:
    inspector = inspect(engine)
    _ensure_user_schema(inspector)
    _ensure_video_schema(inspector)