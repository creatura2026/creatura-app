"""AS-75 : lien de réinitialisation du mot de passe."""

import datetime as dt

from pydantic import Field, field_validator

from app.schemas.auth import _fits_bcrypt
from app.schemas.base import ApiInput, ApiModel


class PasswordResetLinkOut(ApiModel):
    url: str  # à copier et envoyer au joueur ; ne sera plus jamais affiché
    expires_at: dt.datetime


class PasswordResetIn(ApiInput):
    token: str = Field(min_length=1, max_length=200)
    # Mêmes règles qu'à l'inscription.
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        return _fits_bcrypt(value)
