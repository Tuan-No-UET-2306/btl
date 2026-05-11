"""
User repository — encapsulates all User model database operations.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..models.models import User


class UserRepository:
    """Data access layer for User entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_by_id(self, user_id: int) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def find_by_username(self, username: str) -> Optional[User]:
        return self.db.query(User).filter(User.username == username).first()

    def find_all(self) -> list[User]:
        return self.db.query(User).order_by(User.id.asc()).all()

    def create(self, username: str, hashed_password: str, role: str = "user") -> User:
        user = User(
            username=username,
            hashed_password=hashed_password,
            role=role,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(
        self,
        user: User,
        username: Optional[str] = None,
        hashed_password: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> User:
        if username is not None:
            user.username = username
        if hashed_password is not None:
            user.hashed_password = hashed_password
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete(self, user: User) -> None:
        self.db.delete(user)
        self.db.commit()