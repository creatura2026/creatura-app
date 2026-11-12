"""UC-08 : explorer les autres joueurs, leurs cartes, et qui possède une créature."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.controllers.catalog import CATALOG_ORDER, normalize, paginate, parse_creature_id, plain
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
    """Cartes du joueur : toutes peuvent être échangées, y compris son dernier exemplaire."""
    player = get_player(db, player_id)
    rows = db.scalars(
        select(Collection)
        .join(Creature, Creature.id == Collection.creature_id)
        .where(Collection.utilisateur_id == player.id, Collection.quantite >= 1)
        .order_by(*CATALOG_ORDER)
    )
    return player, list(rows)


def creature_owners(db: Session, me: Utilisateur, creature_id: str) -> tuple[Creature, list[tuple[Utilisateur, int]]]:
    """Joueurs (sauf moi) qui possèdent la créature, du plus grand nombre d'exemplaires au plus petit."""
    creature = db.get(Creature, parse_creature_id(creature_id))
    if creature is None:
        raise NotFound("Cette créature n'existe pas.")
    rows = db.execute(
        select(Utilisateur, Collection.quantite)
        .join(Collection, Collection.utilisateur_id == Utilisateur.id)
        .where(
            Collection.creature_id == creature.id,
            Collection.quantite >= 1,
            Utilisateur.role == Role.JOUEUR,
            Utilisateur.id != me.id,
        )
        .order_by(Collection.quantite.desc(), Utilisateur.pseudo, Utilisateur.id)
    ).all()
    return creature, [(user, quantity) for user, quantity in rows]
