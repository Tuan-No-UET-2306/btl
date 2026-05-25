"""Unit tests for Service layer."""

import pytest
from sqlalchemy.orm import Session

from ..core.exceptions import ConflictException, NotFoundException, UnauthorizedException
from ..models.models import User
from ..services.auth_service import AuthService
from ..services.user_service import UserService
from ..services.detection_service import DetectionService


class TestAuthService:
    """Tests for AuthService."""

    def test_register_user(self, db_session: Session):
        service = AuthService(db_session)
        user = service.register(username="newuser", password="pass123")
        assert user.id is not None
        assert user.username == "newuser"
        assert user.role == "user"

    def test_register_duplicate_username(self, db_session: Session, sample_user: User):
        service = AuthService(db_session)
        with pytest.raises(ConflictException) as exc:
            service.register(username="testuser", password="pass456")
        assert "already exists" in str(exc.value.detail)

    def test_login_success(self, db_session: Session, sample_user: User):
        service = AuthService(db_session)
        token = service.login(username="testuser", password="testpass123")
        assert token.access_token is not None
        assert token.role == "user"
        assert token.username == "testuser"

    def test_login_wrong_password(self, db_session: Session, sample_user: User):
        service = AuthService(db_session)
        with pytest.raises(UnauthorizedException) as exc:
            service.login(username="testuser", password="wrongpass")
        assert "Invalid" in str(exc.value.detail)

    def test_login_nonexistent_user(self, db_session: Session):
        service = AuthService(db_session)
        with pytest.raises(UnauthorizedException):
            service.login(username="nobody", password="pass")


class TestUserService:
    """Tests for UserService."""

    def test_list_users(self, db_session: Session, sample_user: User):
        service = UserService(db_session)
        users = service.list_users()
        assert len(users) >= 1
        assert any(u.username == "testuser" for u in users)

    def test_create_user(self, db_session: Session):
        service = UserService(db_session)
        user = service.create_user(username="another", password="pass", role="admin")
        assert user.username == "another"
        assert user.role == "admin"

    def test_create_duplicate(self, db_session: Session, sample_user: User):
        service = UserService(db_session)
        with pytest.raises(ConflictException):
            service.create_user(username="testuser", password="pass")

    def test_update_user(self, db_session: Session, sample_user: User):
        service = UserService(db_session)
        updated = service.update_user(
            user_id=sample_user.id,
            username="updated",
            role="admin",
        )
        assert updated.username == "updated"
        assert updated.role == "admin"

    def test_update_nonexistent(self, db_session: Session):
        service = UserService(db_session)
        with pytest.raises(NotFoundException):
            service.update_user(user_id=9999, username="nope")

    def test_delete_user(self, db_session: Session, sample_user: User):
        service = UserService(db_session)
        service.delete_user(sample_user.id)
        users = service.list_users()
        assert all(u.id != sample_user.id for u in users)

    def test_delete_nonexistent(self, db_session: Session):
        service = UserService(db_session)
        with pytest.raises(NotFoundException):
            service.delete_user(user_id=9999)


class TestDetectionService:
    """Tests for DetectionService."""

    def test_create_detection(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        detection = service.create_detection(
            user_id=sample_user.id,
            plate_number="29A-123.45",
            confidence=0.95,
        )
        assert detection.id is not None
        assert detection.user_id == sample_user.id
        assert detection.plate_number == "29A-123.45"

    def test_list_detections(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        service.create_detection(user_id=sample_user.id, plate_number="29A-111.11", confidence=0.9)
        service.create_detection(user_id=sample_user.id, plate_number="29A-222.22", confidence=0.8)
        detections = service.list_detections(user_id=sample_user.id)
        assert len(detections) == 2

    def test_update_detection(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        created = service.create_detection(
            user_id=sample_user.id,
            plate_number="29A-123.45",
            confidence=0.9,
        )
        updated = service.update_detection(
            detection_id=created.id,
            user_id=sample_user.id,
            plate_number="29A-999.99",
            confidence=0.99,
            is_blacklisted=True,
        )
        assert updated.plate_number == "29A-999.99"
        assert updated.is_blacklisted is True

    def test_update_nonexistent(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        with pytest.raises(NotFoundException):
            service.update_detection(detection_id=9999, user_id=sample_user.id, confidence=0.5)

    def test_delete_detection(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        created = service.create_detection(
            user_id=sample_user.id,
            plate_number="29A-123.45",
            confidence=0.9,
        )
        service.delete_detection(created.id, user_id=sample_user.id)
        assert len(service.list_detections(user_id=sample_user.id)) == 0

    def test_delete_nonexistent(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        with pytest.raises(NotFoundException):
            service.delete_detection(detection_id=9999, user_id=sample_user.id)

    def test_save_lpr_results(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        plates = [
            {"plate_number": "29A-123.45", "confidence": 0.95},
            {"plate_number": "30B-678.90", "confidence": 0.88},
        ]
        saved = service.save_lpr_results(sample_user.id, plates)
        assert len(saved) == 2
        assert saved[0].plate_number == "29A-123.45"

    def test_save_lpr_results_empty_plate(self, db_session: Session, sample_user: User):
        service = DetectionService(db_session)
        plates = [
            {"plate_number": "", "confidence": 0.0},
            {"plate_number": "29A-123.45", "confidence": 0.95},
        ]
        saved = service.save_lpr_results(sample_user.id, plates)
        assert len(saved) == 1  # Only the non-empty plate is saved
