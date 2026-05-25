"""Unit tests for Repository layer."""

import pytest
from sqlalchemy.orm import Session

from ..models.models import User, DetectionHistory
from ..repositories.user_repository import UserRepository
from ..repositories.detection_repository import DetectionRepository


class TestUserRepository:
    """Tests for UserRepository."""

    def test_create_user(self, db_session: Session):
        repo = UserRepository(db_session)
        user = repo.create(username="newuser", hashed_password="hashed123", role="user")
        assert user.id is not None
        assert user.username == "newuser"
        assert user.role == "user"
        assert user.is_active is True

    def test_find_by_username(self, db_session: Session, sample_user: User):
        repo = UserRepository(db_session)
        found = repo.find_by_username("testuser")
        assert found is not None
        assert found.id == sample_user.id

    def test_find_by_username_not_found(self, db_session: Session):
        repo = UserRepository(db_session)
        found = repo.find_by_username("nonexistent")
        assert found is None

    def test_find_by_id(self, db_session: Session, sample_user: User):
        repo = UserRepository(db_session)
        found = repo.find_by_id(sample_user.id)
        assert found is not None
        assert found.username == "testuser"

    def test_find_all(self, db_session: Session, sample_user: User):
        repo = UserRepository(db_session)
        users = repo.find_all()
        assert len(users) >= 1

    def test_update_user(self, db_session: Session, sample_user: User):
        repo = UserRepository(db_session)
        updated = repo.update(sample_user, username="updateduser", role="admin")
        assert updated.username == "updateduser"
        assert updated.role == "admin"

    def test_delete_user(self, db_session: Session, sample_user: User):
        repo = UserRepository(db_session)
        repo.delete(sample_user)
        found = repo.find_by_id(sample_user.id)
        assert found is None


class TestDetectionRepository:
    """Tests for DetectionRepository."""

    def test_create_detection(self, db_session: Session, sample_user: User):
        repo = DetectionRepository(db_session)
        detection = repo.create(
            user_id=sample_user.id,
            plate_number="29A-123.45",
            confidence=0.95,
            image_url="http://test.com/img.jpg",
        )
        assert detection.id is not None
        assert detection.user_id == sample_user.id
        assert detection.plate_number == "29A-123.45"
        assert detection.confidence == 0.95

    def test_find_all(self, db_session: Session, sample_user: User):
        repo = DetectionRepository(db_session)
        repo.create(user_id=sample_user.id, plate_number="29A-111.11", confidence=0.9)
        repo.create(user_id=sample_user.id, plate_number="29A-222.22", confidence=0.8)
        detections = repo.find_all(user_id=sample_user.id)
        assert len(detections) == 2

    def test_find_by_id(self, db_session: Session, sample_user: User):
        repo = DetectionRepository(db_session)
        created = repo.create(user_id=sample_user.id, plate_number="30B-333.33", confidence=0.85)
        found = repo.find_by_id(created.id, user_id=sample_user.id)
        assert found is not None
        assert found.plate_number == "30B-333.33"

    def test_update_detection(self, db_session: Session, sample_user: User):
        repo = DetectionRepository(db_session)
        created = repo.create(user_id=sample_user.id, plate_number="29A-123.45", confidence=0.9)
        updated = repo.update(created, plate_number="29A-999.99", confidence=0.99)
        assert updated.plate_number == "29A-999.99"
        assert updated.confidence == 0.99

    def test_delete_detection(self, db_session: Session, sample_user: User):
        repo = DetectionRepository(db_session)
        created = repo.create(user_id=sample_user.id, plate_number="29A-123.45", confidence=0.9)
        repo.delete(created)
        found = repo.find_by_id(created.id, user_id=sample_user.id)
        assert found is None
