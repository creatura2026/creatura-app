"""UC-01 / UC-02 : inscription, connexion, jetons, profil."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.controllers import booster, collection
from app.dependencies import user_from_token
from app.errors import Unauthorized, field_error, from_integrity_error
from app.models import Role, Utilisateur
from app.schemas.auth import AuthTokensOut, MeOut, RegisterIn, UserOut
from app.security import ACCESS, REFRESH, create_token, hash_password, verify_password


def _tokens(user: Utilisateur) -> AuthTokensOut:
    return AuthTokensOut(
        access_token=create_token(user, ACCESS),
        refresh_token=create_token(user, REFRESH),
        expires_in=get_settings().access_token_minutes * 60,
        user=UserOut.of(user),
    )


def register(db: Session, data: RegisterIn) -> Utilisateur:
    if db.scalar(select(Utilisateur.id).where(Utilisateur.identifiant == data.login)):
        raise field_error("LOGIN_ALREADY_USED", "login", "Cet identifiant est déjà utilisé.")
    if db.scalar(select(Utilisateur.id).where(func.lower(Utilisateur.pseudo) == data.pseudo.lower())):
        raise field_error("PSEUDO_ALREADY_USED", "pseudo", "Ce pseudonyme est déjà pris.")

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


def login(db: Session, login_: str, password: str) -> AuthTokensOut:
    user = db.scalar(select(Utilisateur).where(Utilisateur.identifiant == login_))
    if user is None or not verify_password(password, user.mot_de_passe_hash):
        # Le message ne dit pas lequel des deux est faux.
        raise Unauthorized("Identifiant ou mot de passe incorrect.", "INVALID_CREDENTIALS")
    return _tokens(user)


def refresh(db: Session, refresh_token: str) -> AuthTokensOut:
    """Nouvelle paire de jetons.

    Sans table de sessions, l'ancien jeton de rafraîchissement reste valide jusqu'à son
    expiration (pas de rotation ni de révocation côté serveur).
    """
    return _tokens(user_from_token(db, refresh_token, REFRESH))


def me(db: Session, user: Utilisateur) -> MeOut:
    return MeOut(
        **UserOut.of(user).model_dump(by_alias=False),
        progress=collection.progress(db, user.id),
        booster_available_today=booster.available_today(user, booster.today(db)),
    )
