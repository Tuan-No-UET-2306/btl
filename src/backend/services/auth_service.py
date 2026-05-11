"""
Authentication service — handles user registration, login, and JWT operations.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..core.exceptions import ConflictException, UnauthorizedException
from ..core.security import create_access_token, hash_password, verify_password
from ..models.schemas import Token
from ..repositories.user_repository import UserRepository


class AuthService:
    """Business logic for authentication and authorization."""

    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    def register(self, username: str, password: str, role: str = "user") -> "User":
        """Register a new user. Raises ConflictException if username already exists."""
        from ..models.models import User

        existing = self.user_repo.find_by_username(username)
        if existing:
            raise ConflictException(detail=f"Username '{username}' already exists")

        hashed = hash_password(password)
        user = self.user_repo.create(
            username=username,
            hashed_password=hashed,
            role=role,
        )
        return user

    def login(self, username: str, password: str) -> Token:
        """Authenticate user and return JWT token. Raises UnauthorizedException on failure."""
        user = self.user_repo.find_by_username(username)
        if not user or not verify_password(password, user.hashed_password):
            raise UnauthorizedException(detail="Invalid username or password")

        access_token = create_access_token(
            {"sub": str(user.id), "role": user.role, "username": user.username}
        )
        return Token(
            access_token=access_token,
            role=user.role,
            username=user.username,
        )

    def get_current_user_profile(self, current_user: "User") -> "User":
        """Return the current authenticated user's profile."""
        return current_user