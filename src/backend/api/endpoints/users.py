"""User management endpoints — list, create, update, delete users (admin)."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ...models.models import User
from ...models.schemas import UserCreate, UserResponse, UserUpdate
from ...services.user_service import UserService

router = APIRouter()


@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = UserService(db)
    return service.list_users()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = UserService(db)
    return service.create_user(
        username=payload.username,
        password=payload.password,
        role=payload.role,
    )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = UserService(db)
    return service.update_user(
        user_id=user_id,
        username=payload.username,
        password=payload.password,
        role=payload.role,
        is_active=payload.is_active,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = UserService(db)
    service.delete_user(user_id)
    return None