"""Public setup endpoints (no auth required)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import Company, User

router = APIRouter()


class SetupStatus(BaseModel):
    has_users: bool
    has_companies: bool


@router.get("/status", response_model=SetupStatus)
def get_setup_status(db: Session = Depends(get_db)):
    """Check if this is a fresh instance (no users or companies)."""
    user_count = db.scalar(select(func.count()).select_from(User))
    company_count = db.scalar(select(func.count()).select_from(Company))
    return SetupStatus(
        has_users=user_count > 0,
        has_companies=company_count > 0,
    )
