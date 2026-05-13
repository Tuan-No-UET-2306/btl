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

        # Fix email column: old schema has email with UNIQUE constraint → causes duplicate key error
        if "email" in user_columns:
            col_info = [c for c in inspector.get_columns("users") if c["name"] == "email"]
            if col_info and col_info[0].get("nullable", True) is False:
                connection.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL"))
                connection.execute(text("ALTER TABLE users ALTER COLUMN email SET DEFAULT ''"))
                logger.info("Fixed users.email: dropped NOT NULL, set DEFAULT ''")

            # Drop unique constraint on email (old schema)
            try:
                constraints = [c for c in inspector.get_unique_constraints("users") if c["column_names"] == ["email"]]
                if constraints:
                    constraint_name = constraints[0]["name"]
                    connection.execute(text(f'ALTER TABLE users DROP CONSTRAINT "{constraint_name}"'))
                    logger.info("Dropped unique constraint '%s' on users.email", constraint_name)
            except Exception as e:
                logger.warning("Could not drop unique constraint on email: %s", e)


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


def _ensure_blacklist_schema(inspector) -> None:
    """Ensure blacklisted_plates table exists."""
    if "blacklisted_plates" in inspector.get_table_names():
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE blacklisted_plates ("
                "  id SERIAL PRIMARY KEY,"
                "  plate_number VARCHAR(32) NOT NULL UNIQUE,"
                "  reason TEXT,"
                "  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,"
                "  created_at TIMESTAMPTZ DEFAULT now()"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX ix_blacklisted_plates_plate_number "
                "ON blacklisted_plates(plate_number)"
            )
        )
        logger.info("Created blacklisted_plates table")


def _ensure_detection_schema(inspector) -> None:
    """Ensure detection_histories table has user_id column."""
    if "detection_histories" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("detection_histories")}
    if "user_id" in columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE detection_histories "
                "ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"
            )
        )
        # Set default user_id for existing records (first user)
        first_user = connection.execute(
            text("SELECT id FROM users ORDER BY id ASC LIMIT 1")
        ).scalar()
        if first_user:
            connection.execute(
                text("UPDATE detection_histories SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": first_user},
            )
        connection.execute(
            text("ALTER TABLE detection_histories ALTER COLUMN user_id SET NOT NULL")
        )
        connection.execute(
            text(
                "CREATE INDEX ix_detection_histories_user_id "
                "ON detection_histories(user_id)"
            )
        )
        logger.info("Added user_id column to detection_histories table")


def ensure_schema() -> None:
    inspector = inspect(engine)
    _ensure_user_schema(inspector)
    _ensure_video_schema(inspector)
    _ensure_blacklist_schema(inspector)
    _ensure_detection_schema(inspector)
