"""
Pytest configuration and fixtures for testing.
Uses SQLite in-memory database for isolation.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ..core.security import hash_password, create_access_token
from ..main import app
from ..models.database import Base
from ..models.models import User

# Use SQLite file-based for tests (in-memory has threading issues)
TEST_DATABASE_URL = "sqlite:///./test_lpr.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override the get_db dependency to use test database."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session() -> Session:
    """Provide a clean database session for each test."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session) -> TestClient:
    """FastAPI test client with overridden DB dependency."""
    from ..api.dependencies import get_db

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def sample_user(db_session: Session) -> User:
    """Create a sample user for testing."""
    user = User(
        username="testuser",
        hashed_password=hash_password("testpass123"),
        role="user",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_user(db_session: Session) -> User:
    """Create a sample admin user for testing."""
    user = User(
        username="admin",
        hashed_password=hash_password("admin123"),
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def user_token(sample_user: User) -> str:
    """Generate a JWT token for the sample user."""
    return create_access_token(
        {"sub": str(sample_user.id), "role": sample_user.role, "username": sample_user.username}
    )


@pytest.fixture
def admin_token(admin_user: User) -> str:
    """Generate a JWT token for the admin user."""
    return create_access_token(
        {"sub": str(admin_user.id), "role": admin_user.role, "username": admin_user.username}
    )


@pytest.fixture
def auth_header(user_token: str) -> dict:
    """Authorization header with Bearer token."""
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture
def admin_auth_header(admin_token: str) -> dict:
    """Authorization header for admin."""
    return {"Authorization": f"Bearer {admin_token}"}