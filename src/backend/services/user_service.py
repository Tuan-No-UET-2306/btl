"""
User management service — CRUD operations for users.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..core.exceptions import ConflictException, NotFoundException
from ..core.security import hash_password
from ..models.models import User
from ..repositories.user_repository import UserRepository


class UserService:
    """Business logic for user management (admin operations)."""

    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    def list_users(self) -> list[User]:
        """Return all users."""
        return self.user_repo.find_all()

    def create_user(self, username: str, password: str, role: str = "user") -> User:
        """Create a new user. Raises ConflictException if username exists."""
        existing = self.user_repo.find_by_username(username)
        if existing:
            raise ConflictException(detail=f"Username '{username}' already exists")

        hashed = hash_password(password)
        return self.user_repo.create(
            username=username,
            hashed_password=hashed,
            role=role,
        )

    def update_user(
        self,
        user_id: int,
        username: Optional[str] = None,
        password: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> User:
        """Update user fields. Raises NotFoundException if user not found."""
        user = self.user_repo.find_by_id(user_id)
        if not user:
            raise NotFoundException(detail=f"User with id '{user_id}' not found")

        hashed_password = hash_password(password) if password else None
        return self.user_repo.update(
            user,
            username=username,
            hashed_password=hashed_password,
            role=role,
            is_active=is_active,
        )

    def delete_user(self, user_id: int) -> None:
        """Delete a user by id. Raises NotFoundException if not found."""
        user = self.user_repo.find_by_id(user_id)
        if not user:
            raise NotFoundException(detail=f"User with id '{user_id}' not found")
        self.user_repo.delete(user)