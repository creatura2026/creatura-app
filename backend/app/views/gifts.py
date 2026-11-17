"""Dons de carte — un joueur offre une carte à un autre, à accepter ou refuser (contrat « Gift »)."""

import uuid

from fastapi import APIRouter, status

from app.controllers import gift
from app.dependencies import DbSession, Pagination, PlayerUser
from app.schemas.base import Page
from app.schemas.gift import STATUT_OF, GiftCreateIn, GiftOut, GiftRole, GiftStatus

router = APIRouter(prefix="/gifts", tags=["Dons"])


@router.post("", response_model=GiftOut, status_code=status.HTTP_201_CREATED)
def create_gift(data: GiftCreateIn, user: PlayerUser, db: DbSession):
    """Offre une ou plusieurs copies d'une carte possédée à un autre joueur (statut `PENDING`)."""
    return GiftOut.of(gift.create_gift(db, user, data))


@router.get("", response_model=Page[GiftOut])
def list_my_gifts(
    user: PlayerUser,
    db: DbSession,
    page: Pagination,
    role: GiftRole = GiftRole.all,
    status: GiftStatus | None = None,
):
    """Mes dons (reçus et/ou envoyés), du plus récent au plus ancien."""
    statut = STATUT_OF[status] if status else None
    return Page[GiftOut].of(gift.list_gifts(db, user, page, statut, role), GiftOut.of)


@router.post("/{giftId}/accept", response_model=GiftOut)
def accept_gift(giftId: uuid.UUID, user: PlayerUser, db: DbSession):  # noqa: N803 (nom du contrat)
    """Le destinataire accepte : les cartes passent dans sa collection, tout ou rien."""
    return GiftOut.of(gift.accept_gift(db, user, giftId))


@router.post("/{giftId}/refuse", response_model=GiftOut)
def refuse_gift(giftId: uuid.UUID, user: PlayerUser, db: DbSession):  # noqa: N803
    """Le destinataire refuse : rien n'est transféré."""
    return GiftOut.of(gift.refuse_gift(db, user, giftId))


@router.post("/{giftId}/cancel", response_model=GiftOut)
def cancel_gift(giftId: uuid.UUID, user: PlayerUser, db: DbSession):  # noqa: N803
    """Le donneur annule le don tant qu'il est en attente."""
    return GiftOut.of(gift.cancel_gift(db, user, giftId))
