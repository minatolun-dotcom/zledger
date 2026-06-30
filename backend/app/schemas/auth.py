"""Auth schemas."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel
from app.schemas.user import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class MeResponse(ORMModel):
    user: UserOut
    companies: list["CompanyBrief"]


class CompanyBrief(BaseModel):
    id: str
    name: str
    role: str


# Forward ref resolution
MeResponse.model_rebuild()
