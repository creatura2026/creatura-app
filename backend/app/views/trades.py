"""Échanges — UC-09, UC-10, UC-11."""

import uuid

from fastapi import APIRouter, status

from app.controllers import trade
from app.dependencies import CurrentUser, DbSession
from app.models import Statut
from app.schemas.trade import TradeCreateIn, TradeOut, TradeRole

router = APIRouter(prefix="/trades", tags=["Échanges"])


@router.post("", response_model=TradeOut, status_code=status.HTTP_201_CREATED)
def create_trade(data: TradeCreateIn, user: CurrentUser, db: DbSession):
    """Propose des cartes à moi contre des cartes d'un autre joueur (au moins 1 de chaque côté)."""
    return TradeOut.of(trade.create_trade(db, user, data))


@router.get("", response_model=list[TradeOut])
def list_trades(
    user: CurrentUser,
    db: DbSession,
    status: Statut | None = None,
    role: TradeRole = TradeRole.all,
):
    """Historique de mes échanges (`role` : envoyés, reçus ou tous)."""
    return [TradeOut.of(t) for t in trade.list_trades(db, user, status, role)]


@router.get("/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return TradeOut.of(trade.get_trade(db, user, trade_id))


@router.post("/{trade_id}/cancel", response_model=TradeOut)
def cancel_trade(trade_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """L'auteur retire sa proposition (tant qu'elle est en attente)."""
    return TradeOut.of(trade.cancel_trade(db, user, trade_id))


@router.post("/{trade_id}/accept", response_model=TradeOut)
def accept_trade(trade_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Le destinataire accepte : les cartes sont transférées en une seule transaction."""
    return TradeOut.of(trade.accept_trade(db, user, trade_id))


@router.post("/{trade_id}/refuse", response_model=TradeOut)
def refuse_trade(trade_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Le destinataire refuse : aucun transfert."""
    return TradeOut.of(trade.refuse_trade(db, user, trade_id))
