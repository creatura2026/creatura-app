"""UC-08 : explorer les autres joueurs et leurs cartes échangeables."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.controllers.catalog import CATALOG_ORDER, normalize, paginate, plain
from app.errors import NotFound
from app.models import Collection, Creature, Role, Utilisateur
from app.schemas.base import PageParams, PageResult


def get_player(db: Session, player_id: uuid.UUID) -> Utilisateur:
    player = db.get(Utilisateur, player_id)
    if player is None or player.role != Role.JOUEUR:
        raise NotFound("Ce joueur n'existe pas.")
    return player


def search_players(db: Session, me: Utilisateur, search: str, params: PageParams) -> PageResult:
    """Joueurs dont le pseudonyme commence par `search` (sans casse ni accents), sauf moi."""
    query = (
        select(Utilisateur)
        .where(
            Utilisateur.role == Role.JOUEUR,
            Utilisateur.id != me.id,
            plain(Utilisateur.pseudo).startswith(normalize(search), autoescape=True),
        )
        .order_by(Utilisateur.pseudo, Utilisateur.id)
    )
    return paginate(db, query, params)


def tradeable_cards(db: Session, player_id: uuid.UUID) -> tuple[Utilisateur, list[Collection]]:
    """Doublons du joueur : un exemplaire de chaque carte lui reste toujours.

    Règle proposée par le contrat, à valider au point client.
    """
    player = get_player(db, player_id)
    rows = db.scalars(
        select(Collection)
        .join(Creature, Creature.id == Collection.creature_id)
        .where(Collection.utilisateur_id == player.id, Collection.quantite >= 2)
        .order_by(*CATALOG_ORDER)
    )
    return player, list(rows)
