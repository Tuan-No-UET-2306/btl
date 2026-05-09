from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from ..core.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema() -> None:
	inspector = inspect(engine)
	if "uploaded_videos" not in inspector.get_table_names():
		return

	columns = {column["name"] for column in inspector.get_columns("uploaded_videos")}
	if "uploaded_at" in columns:
		return

	# Lightweight safety migration for local dev when schema lags behind models.
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
