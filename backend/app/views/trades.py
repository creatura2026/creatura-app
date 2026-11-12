"""Échanges — UC-09, UC-10, UC-11."""

import uuid

from fastapi import APIRouter, status

from app.controllers import trade
from app.dependencies import CurrentUser, DbSession, Pagination
from app.schemas.base import Page
from app.schemas.trade import STATUT_OF, TradeCreateIn, TradeOut, TradeRole, TradeStatus

router = APIRouter(prefix="/trades", tags=["Échanges"])


@router.post("", response_model=TradeOut, status_code=status.HTTP_201_CREATED)
def create_trade(data: TradeCreateIn, user: CurrentUser, db: DbSession):
    """Propose des cartes contre des cartes d'un autre joueur (au moins 1 de chaque côté)."""
    return TradeOut.of(trade.create_trade(db, user, data))


@router.get("", response_model=Page[TradeOut])
def list_trades(
    user: CurrentUser,
    db: DbSession,
    page: Pagination,
    role: TradeRole = TradeRole.all,
    status: TradeStatus | None = None,
):
    """Historique de mes échanges, du plus récent au plus ancien (`role` : envoyés, reçus ou tous)."""
    statut = STATUT_OF[status] if status else None
    return Page[TradeOut].of(trade.list_trades(db, user, page, statut, role), TradeOut.of)


@router.get("/{tradeId}", response_model=TradeOut)
def get_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803 (nom du contrat)
    return TradeOut.of(trade.get_trade(db, user, tradeId))


@router.post("/{tradeId}/accept", response_model=TradeOut)
def accept_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803
    """Le destinataire accepte : les cartes sont transférées en une seule transaction.

    Si une carte n'est plus disponible : 409 `CARDS_UNAVAILABLE`, rien n'est transféré et
    l'échange passe en FAILED.
    """
    return TradeOut.of(trade.accept_trade(db, user, tradeId))


@router.post("/{tradeId}/refuse", response_model=TradeOut)
def refuse_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803
    """Le destinataire refuse : aucun transfert."""
    return TradeOut.of(trade.refuse_trade(db, user, tradeId))


@router.post("/{tradeId}/cancel", response_model=TradeOut)
def cancel_trade(tradeId: uuid.UUID, user: CurrentUser, db: DbSession):  # noqa: N803
    """Le proposant retire sa proposition, tant qu'elle est en attente."""
    return TradeOut.of(trade.cancel_trade(db, user, tradeId))
