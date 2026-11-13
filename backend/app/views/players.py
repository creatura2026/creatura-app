"""Joueurs et propriétaires d'une créature — UC-08."""

import uuid

from fastapi import APIRouter, Query

from app.controllers import player
from app.dependencies import PlayerUser, DbSession, Pagination
from app.schemas.base import Page
from app.schemas.catalog import CreatureSummaryOut
from app.schemas.player import CreatureOwnerOut, CreatureOwnersOut, PlayerOut, TradeableCardOut, TradeableCardsOut

router = APIRouter(tags=["Joueurs"])


@router.get("/players", response_model=Page[PlayerOut])
def search_players(
    user: PlayerUser,
    db: DbSession,
    page: Pagination,
    search: str = Query(min_length=2, max_length=20, description="Début du pseudonyme"),
):
    """Joueurs dont le pseudonyme commence par `search` (le joueur connecté est exclu)."""
    return Page[PlayerOut].of(player.search_players(db, user, search, page), PlayerOut.of)


@router.get("/players/{playerId}/tradeable-cards", response_model=TradeableCardsOut)
def tradeable_cards(playerId: uuid.UUID, _: PlayerUser, db: DbSession):  # noqa: N803 (nom du contrat)
    """Cartes du joueur : toutes peuvent être échangées, y compris son dernier exemplaire."""
    owner, rows = player.tradeable_cards(db, playerId)
    return TradeableCardsOut(
        player=PlayerOut.of(owner),
        items=[
            TradeableCardOut(creature=CreatureSummaryOut.of(c.creature), available_quantity=c.quantite)
            for c in rows
        ],
    )


@router.get("/creatures/{creatureId}/owners", response_model=CreatureOwnersOut)
def creature_owners(creatureId: str, user: PlayerUser, db: DbSession):  # noqa: N803 (nom du contrat)
    """Joueurs qui possèdent la créature (le joueur connecté est exclu), le plus d'exemplaires d'abord."""
    creature, owners = player.creature_owners(db, user, creatureId)
    return CreatureOwnersOut(
        creature=CreatureSummaryOut.of(creature),
        items=[CreatureOwnerOut(player=PlayerOut.of(u), quantity=q) for u, q in owners],
    )
