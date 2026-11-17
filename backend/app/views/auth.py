"""Authentification — UC-01, UC-02."""

from fastapi import APIRouter, status

from starlette.concurrency import run_in_threadpool

from app.controllers import account, auth, password_reset
from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import (
    AccountDeleteIn,
    AuthTokensOut,
    LoginIn,
    MeOut,
    PasswordChangeIn,
    RefreshIn,
    RegisterIn,
    UserOut,
)
from app.schemas.password_reset import PasswordResetIn
from app.views.trades import notify_room

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


@router.post("/auth/password-reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(data: PasswordResetIn, db: DbSession):
    """AS-75 (sans jeton d'accès) : nouveau mot de passe avec le jeton d'un lien généré par un
    admin. Lien inconnu, expiré, déjà utilisé ou remplacé : 400 RESET_LINK_INVALID. Les sessions
    ouvertes du joueur sont fermées."""
    password_reset.reset_password(db, data.token, data.new_password)


@router.put("/me/password", response_model=AuthTokensOut)
def change_password(data: PasswordChangeIn, user: CurrentUser, db: DbSession):
    """Change le mot de passe (l'actuel est demandé). Les autres sessions sont fermées ;
    celle-ci reçoit de nouveaux jetons."""
    return account.change_password(db, user, data.current_password, data.new_password)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(data: AccountDeleteIn, user: CurrentUser, db: DbSession):
    """Supprime son compte (le mot de passe est demandé) : identifiants et collection effacés,
    échanges en cours abandonnés, historique des autres joueurs anonymisé (« Joueur supprimé »).
    Un administrateur ne peut le faire que s'il reste un autre administrateur (409 LAST_ADMIN)."""
    abandoned = await run_in_threadpool(account.delete_account, db, user, data.password)
    for trade_id in abandoned:
        await notify_room(trade_id)


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DbSession):
    """Profil du joueur connecté, progression de sa collection et disponibilité du booster."""
    return auth.me(db, user)

