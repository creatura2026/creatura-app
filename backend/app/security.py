"""Hachage des mots de passe (bcrypt) et jetons JWT (accès + rafraîchissement)."""

from datetime import timedelta

import bcrypt
import jwt

from app.config import get_settings
from app.errors import Unauthorized
from app.models import Utilisateur, utcnow

ACCESS = "access"
REFRESH = "refresh"

# bcrypt ne prend en compte que les 72 premiers octets du mot de passe.
BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:  # mot de passe trop long ou hash invalide
        return False


def create_token(user: Utilisateur, kind: str) -> str:
    settings = get_settings()
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if kind == ACCESS
        else timedelta(days=settings.refresh_token_days)
    )
    now = utcnow()
    payload = {
        "sub": str(user.id),
        "type": kind,
        "role": user.role.value,
        "iat": now,
        "exp": now + lifetime,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_kind: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Votre session a expiré, reconnectez-vous.")
    except jwt.InvalidTokenError:
        raise Unauthorized("Votre session est invalide, reconnectez-vous.")
    if payload.get("type") != expected_kind:
        raise Unauthorized("Type de jeton invalide.")
    return payload
