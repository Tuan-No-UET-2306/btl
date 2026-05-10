"""Authentication endpoints — register, login, get profile."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_user, get_db
from ...models.models import User
from ...models.schemas import LoginRequest, Token, UserCreate, UserResponse
from ...services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    service = AuthService(db)
    user = service.register(
        username=payload.username,
        password=payload.password,
        role=payload.role,
    )
    return user


@router.post("/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    return service.login(
        username=credentials.username,
        password=credentials.password,
    )


@router.get("/me", response_model=UserResponse)
def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user