"""Joueurs — UC-08."""

import uuid

from fastapi import APIRouter, Query

from app.controllers import player
from app.dependencies import CurrentUser, DbSession, Pagination
from app.schemas.base import Page
from app.schemas.catalog import CreatureSummaryOut
from app.schemas.player import PlayerOut, TradeableCardOut, TradeableCardsOut

router = APIRouter(tags=["Joueurs"])


@router.get("/players", response_model=Page[PlayerOut])
def search_players(
    user: CurrentUser,
    db: DbSession,
    page: Pagination,
    search: str = Query(min_length=2, max_length=20, description="Début du pseudonyme"),
):
    """Joueurs dont le pseudonyme commence par `search` (le joueur connecté est exclu)."""
    return Page[PlayerOut].of(player.search_players(db, user, search, page), PlayerOut.of)


@router.get("/players/{playerId}/tradeable-cards", response_model=TradeableCardsOut)
def tradeable_cards(playerId: uuid.UUID, _: CurrentUser, db: DbSession):  # noqa: N803 (nom du contrat)
    """Doublons du joueur : un exemplaire de chaque carte lui reste toujours."""
    owner, rows = player.tradeable_cards(db, playerId)
    return TradeableCardsOut(
        player=PlayerOut.of(owner),
        items=[
            TradeableCardOut(creature=CreatureSummaryOut.of(c.creature), available_quantity=c.quantite - 1)
            for c in rows
        ],
    )
