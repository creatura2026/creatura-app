"""Joueurs — UC-08."""

import uuid

from fastapi import APIRouter, Query

from app.controllers import player
from app.dependencies import CurrentUser, DbSession
from app.schemas.catalog import CreatureOut
from app.schemas.player import PlayerOut, TradeableCardOut, TradeableCardsOut

router = APIRouter(tags=["Joueurs"])


@router.get("/players", response_model=list[PlayerOut])
def search_players(
    user: CurrentUser,
    db: DbSession,
    search: str | None = None,
    limit: int = Query(20, ge=1, le=100),
):
    """Recherche d'autres joueurs par pseudonyme."""
    return [PlayerOut.of(p) for p in player.search_players(db, user, search, limit)]


@router.get("/players/{player_id}/tradeable-cards", response_model=TradeableCardsOut)
def tradeable_cards(player_id: uuid.UUID, _: CurrentUser, db: DbSession):
    """Cartes qu'un joueur possède et qui peuvent lui être demandées."""
    owner, rows = player.tradeable_cards(db, player_id)
    return TradeableCardsOut(
        player=PlayerOut.of(owner),
        cards=[TradeableCardOut(creature=CreatureOut.of(c.creature), quantity=c.quantite) for c in rows],
    )
