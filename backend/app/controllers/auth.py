"""UC-01 / UC-02 : inscription, connexion, jetons, profil."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.controllers import collection
from app.dependencies import user_from_token
from app.errors import Conflict, Unauthorized, from_integrity_error
from app.models import Role, Utilisateur
from app.schemas.auth import LoginIn, ProfileOut, RegisterIn, TokenOut, UserOut
from app.security import ACCESS, REFRESH, create_token, hash_password, verify_password


def _tokens(user: Utilisateur) -> TokenOut:
    return TokenOut(access_token=create_token(user, ACCESS), refresh_token=create_token(user, REFRESH))


def register(db: Session, data: RegisterIn) -> Utilisateur:
    if db.scalar(select(Utilisateur.id).where(func.lower(Utilisateur.pseudo) == data.pseudo.lower())):
        raise Conflict("Ce pseudonyme est déjà utilisé")
    if db.scalar(select(Utilisateur.id).where(Utilisateur.identifiant == data.login)):
        raise Conflict("Cet identifiant est déjà utilisé")

    user = Utilisateur(
        pseudo=data.pseudo,
        identifiant=data.login,
        mot_de_passe_hash=hash_password(data.password),
        role=Role.JOUEUR,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:  # inscription simultanée avec le même pseudo/identifiant
        db.rollback()
        raise from_integrity_error(exc)
    return user


def login(db: Session, data: LoginIn) -> TokenOut:
    user = db.scalar(select(Utilisateur).where(Utilisateur.identifiant == data.login))
    if user is None or not verify_password(data.password, user.mot_de_passe_hash):
        raise Unauthorized("Identifiant ou mot de passe incorrect")
    return _tokens(user)


def refresh(db: Session, refresh_token: str) -> TokenOut:
    return _tokens(user_from_token(db, refresh_token, REFRESH))


def profile(db: Session, user: Utilisateur) -> ProfileOut:
    return ProfileOut(**UserOut.of(user).model_dump(), collection=collection.summary(db, user.id))
