import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models import Role, Utilisateur
from app.security import BCRYPT_MAX_BYTES


class RegisterIn(BaseModel):
    pseudo: str = Field(min_length=3, max_length=30)
    login: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=BCRYPT_MAX_BYTES)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode()) > BCRYPT_MAX_BYTES:
            raise ValueError(f"Mot de passe trop long ({BCRYPT_MAX_BYTES} octets maximum)")
        return value


class LoginIn(BaseModel):
    login: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: uuid.UUID
    pseudo: str
    login: str
    role: Role
    created_at: datetime
    last_booster: date | None

    @classmethod
    def of(cls, u: Utilisateur) -> "UserOut":
        return cls(
            id=u.id,
            pseudo=u.pseudo,
            login=u.identifiant,
            role=u.role,
            created_at=u.cree_le,
            last_booster=u.dernier_booster,
        )


class CollectionSummary(BaseModel):
    owned_distinct: int
    total_creatures: int
    completion_percent: float
    total_cards: int
    duplicates: int


class ProfileOut(UserOut):
    collection: CollectionSummary
