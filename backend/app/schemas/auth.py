import enum
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator

from app.models import Role, Utilisateur
from app.schemas.base import ApiInput, ApiModel
from app.security import BCRYPT_MAX_BYTES


class RoleCode(str, enum.Enum):
    PLAYER = "PLAYER"
    ADMIN = "ADMIN"


ROLE_CODES = {Role.JOUEUR: RoleCode.PLAYER, Role.ADMIN: RoleCode.ADMIN}


class RegisterIn(ApiInput):
    pseudo: Annotated[str, StringConstraints(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")]
    # Espaces autour retirés : la base refuse un identifiant vide (btrim).
    login: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50)]
    password: str = Field(min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode()) > BCRYPT_MAX_BYTES:
            raise ValueError(f"mot de passe trop long ({BCRYPT_MAX_BYTES} octets au maximum)")
        return value


class LoginIn(ApiInput):
    login: str = Field(max_length=50)
    password: str = Field(max_length=128)


class RefreshIn(ApiInput):
    refresh_token: str


class UserOut(ApiModel):
    id: uuid.UUID
    pseudo: str
    role: RoleCode
    created_at: datetime

    @classmethod
    def of(cls, u: Utilisateur) -> "UserOut":
        return cls(id=u.id, pseudo=u.pseudo, role=ROLE_CODES[u.role], created_at=u.cree_le)


class AuthTokensOut(ApiModel):
    access_token: str
    refresh_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int  # durée de validité du jeton d'accès, en secondes
    user: UserOut


class CollectionProgress(ApiModel):
    owned_creatures: int  # créatures différentes possédées
    total_creatures: int
    total_cards: int  # exemplaires, doublons compris
    completion_percent: float


class MeOut(UserOut):
    progress: CollectionProgress
    booster_available_today: bool
