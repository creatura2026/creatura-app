"""Comptes — UC-01, UC-02."""

from fastapi import APIRouter, status

from app.controllers import auth
from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import LoginIn, ProfileOut, RefreshIn, RegisterIn, TokenOut, UserOut

router = APIRouter(tags=["Comptes"])


@router.post("/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: DbSession):
    """Crée un compte joueur (sans jeton)."""
    return UserOut.of(auth.register(db, data))


@router.post("/auth/login", response_model=TokenOut)
def login(data: LoginIn, db: DbSession):
    """Retourne un jeton d'accès et un jeton de rafraîchissement (sans jeton)."""
    return auth.login(db, data)


@router.post("/auth/refresh", response_model=TokenOut)
def refresh(data: RefreshIn, db: DbSession):
    """Échange un jeton de rafraîchissement contre une nouvelle paire de jetons (sans jeton)."""
    return auth.refresh(db, data.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_: CurrentUser):
    """Déconnexion : le client supprime ses jetons.

    Le schéma actuel n'a pas de colonne pour révoquer les jetons côté serveur :
    ils restent valides jusqu'à leur expiration.
    """


@router.get("/me", response_model=ProfileOut)
def me(user: CurrentUser, db: DbSession):
    """Profil du joueur connecté avec le résumé de sa collection."""
    return auth.profile(db, user)
