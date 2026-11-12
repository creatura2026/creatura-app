"""Authentification — UC-01, UC-02."""

from fastapi import APIRouter, status

from app.controllers import auth
from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import AuthTokensOut, LoginIn, MeOut, RefreshIn, RegisterIn, UserOut

router = APIRouter(tags=["Authentification"])


@router.post("/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: DbSession):
    """Crée un compte joueur (sans jeton). Le rôle est toujours PLAYER."""
    return UserOut.of(auth.register(db, data))


@router.post("/auth/login", response_model=AuthTokensOut)
def login(data: LoginIn, db: DbSession):
    """Jeton d'accès, jeton de rafraîchissement et utilisateur (sans jeton)."""
    return auth.login(db, data.login, data.password)


@router.post("/auth/refresh", response_model=AuthTokensOut)
def refresh(data: RefreshIn, db: DbSession):
    """Nouvelle paire de jetons à partir du jeton de rafraîchissement (sans jeton d'accès)."""
    return auth.refresh(db, data.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_: CurrentUser, data: RefreshIn | None = None):
    """Déconnexion : le client supprime ses jetons.

    Le schéma n'a pas de table de sessions : le jeton de rafraîchissement envoyé n'est pas
    révoqué, il reste valide jusqu'à son expiration.
    """


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DbSession):
    """Profil du joueur connecté, progression de sa collection et disponibilité du booster."""
    return auth.me(db, user)
