"""Dépendances FastAPI partagées : session DB, utilisateur connecté, rôle admin."""

import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import Forbidden, Unauthorized
from app.models import Role, Utilisateur
from app.security import ACCESS, decode_token

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def user_from_token(db: Session, token: str, kind: str) -> Utilisateur:
    payload = decode_token(token, kind)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise Unauthorized("Jeton invalide")
    user = db.get(Utilisateur, user_id)
    if user is None:
        raise Unauthorized("Compte introuvable, reconnectez-vous")
    return user


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Utilisateur:
    if credentials is None:
        raise Unauthorized("Authentification requise")
    return user_from_token(db, credentials.credentials, ACCESS)


CurrentUser = Annotated[Utilisateur, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> Utilisateur:
    if user.role != Role.ADMIN:
        raise Forbidden("Accès réservé aux administrateurs")
    return user


AdminUser = Annotated[Utilisateur, Depends(require_admin)]
