"""Administration des joueurs et des admins (AS-71). Réservé au rôle ADMIN.

- Joueurs : liste, fiche (cartes par rareté et par famille, connexions par jour ou par mois).
- Suppression de joueurs : demande faite par un admin, validée ou refusée par l'admin choisi.
- Comptes admin : liste, création avec mot de passe provisoire, désactivation par un autre admin.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status

from app.controllers import admin, admin_accounts, password_reset
from app.dependencies import AdminUser, DbSession, Pagination, require_admin
from app.schemas.admin_accounts import (
    STATUT_DEMANDE_OF,
    AdminAccountCreatedOut,
    AdminAccountIn,
    AdminAccountOut,
    AdminPlayerDetailOut,
    AdminPlayerPage,
    DeletionRequestIn,
    DeletionRequestOut,
    DeletionRequestStatus,
    Granularity,
    PlayerSort,
    SortOrder,
)
from app.schemas.base import Page
from app.schemas.password_reset import PasswordResetLinkOut
from app.views.admin import DateFrom, DateTo

router = APIRouter(prefix="/admin", tags=["Administration"], dependencies=[Depends(require_admin)])


# ── Joueurs ──────────────────────────────────────────────────────────────────


@router.get("/players", response_model=AdminPlayerPage)
def list_players(
    db: DbSession,
    page: Pagination,
    date_from: date | None = DateFrom,
    date_to: date | None = DateTo,
    search: str | None = Query(None, max_length=30, description="Partie du pseudonyme"),
    sort: PlayerSort = PlayerSort.PSEUDO,
    order: SortOrder = SortOrder.ASC,
):
    """Joueurs avec leur dernière connexion, leurs connexions sur la période et leurs cartes."""
    period = admin.resolve_period(db, date_from, date_to)
    result = admin_accounts.list_players(db, period, page, search, sort, order)
    return AdminPlayerPage.of(result, lambda row: row, period=period)


@router.get("/players/{playerId}", response_model=AdminPlayerDetailOut)
def get_player(
    playerId: uuid.UUID,  # noqa: N803 (nom du contrat)
    db: DbSession,
    date_from: date | None = DateFrom,
    date_to: date | None = DateTo,
    granularity: Granularity = Granularity.DAY,
):
    """Fiche d'un joueur : cartes par rareté et par famille, connexions par jour ou par mois."""
    period = admin.resolve_period(db, date_from, date_to)
    return admin_accounts.player_detail(db, playerId, period, granularity)


@router.post(
    "/players/{playerId}/password-reset", response_model=PasswordResetLinkOut, status_code=status.HTTP_201_CREATED
)
def create_password_reset_link(playerId: uuid.UUID, user: AdminUser, db: DbSession):  # noqa: N803
    """AS-75 : lien de réinitialisation du mot de passe, valable 5 minutes et une seule fois.
    Le lien précédent du joueur, s'il n'a pas servi, est annulé."""
    return password_reset.create_link(db, user, playerId)


# ── Demandes de suppression ──────────────────────────────────────────────────


@router.get("/deletion-requests", response_model=Page[DeletionRequestOut])
def list_deletion_requests(
    db: DbSession,
    page: Pagination,
    user: AdminUser,
    status: DeletionRequestStatus | None = None,
    to_validate: bool = Query(False, alias="toValidate", description="Seulement celles dont je suis le validateur"),
):
    """Toutes les demandes, journal compris, de la plus récente à la plus ancienne."""
    statut = STATUT_DEMANDE_OF[status] if status else None
    result = admin_accounts.list_requests(db, page, statut, user.id if to_validate else None)
    return Page[DeletionRequestOut].of(result, DeletionRequestOut.of)


@router.post("/deletion-requests", response_model=DeletionRequestOut, status_code=status.HTTP_201_CREATED)
def create_deletion_request(data: DeletionRequestIn, user: AdminUser, db: DbSession):
    """Demande la suppression de joueurs ; seul l'admin choisi (`validatorId`) pourra la valider."""
    return DeletionRequestOut.of(admin_accounts.create_request(db, user, data))


@router.post("/deletion-requests/{requestId}/approve", response_model=DeletionRequestOut)
def approve_deletion_request(requestId: uuid.UUID, user: AdminUser, db: DbSession):  # noqa: N803
    """Validation par l'admin choisi : les joueurs et leurs données sont supprimés tout de suite."""
    return DeletionRequestOut.of(admin_accounts.decide_request(db, user, requestId, approve=True))


@router.post("/deletion-requests/{requestId}/reject", response_model=DeletionRequestOut)
def reject_deletion_request(requestId: uuid.UUID, user: AdminUser, db: DbSession):  # noqa: N803
    """Refus par l'admin choisi : personne n'est supprimé."""
    return DeletionRequestOut.of(admin_accounts.decide_request(db, user, requestId, approve=False))


@router.post("/deletion-requests/{requestId}/cancel", response_model=DeletionRequestOut)
def cancel_deletion_request(requestId: uuid.UUID, user: AdminUser, db: DbSession):  # noqa: N803
    """Annulation par l'admin qui a fait la demande, tant qu'elle est en attente."""
    return DeletionRequestOut.of(admin_accounts.cancel_request(db, user, requestId))


# ── Comptes admin ────────────────────────────────────────────────────────────


@router.get("/admins", response_model=list[AdminAccountOut])
def list_admins(db: DbSession):
    """Tous les admins, actifs d'abord. Sert aussi à choisir le validateur d'une demande."""
    return admin_accounts.list_admins(db)


@router.post("/admins", response_model=AdminAccountCreatedOut, status_code=status.HTTP_201_CREATED)
def create_admin(data: AdminAccountIn, user: AdminUser, db: DbSession):
    """Nouvel admin. Le serveur génère son mot de passe provisoire et le renvoie cette seule fois
    (`temporaryPassword`) ; l'admin le remplace à sa première connexion."""
    return admin_accounts.create_admin(db, user, data)


@router.post("/admins/{adminId}/deactivate", response_model=AdminAccountOut)
def deactivate_admin(adminId: uuid.UUID, user: AdminUser, db: DbSession):  # noqa: N803
    """Désactive un autre admin : il ne peut plus se connecter, ses demandes en attente sont annulées."""
    return admin_accounts.deactivate_admin(db, user, adminId)
