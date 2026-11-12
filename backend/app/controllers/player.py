"""UC-08 : explorer les autres joueurs et leurs cartes échangeables."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import Collection, Creature, Role, Utilisateur


def get_player(db: Session, player_id: uuid.UUID) -> Utilisateur:
    player = db.get(Utilisateur, player_id)
    if player is None or player.role != Role.JOUEUR:
        raise NotFound("Joueur introuvable")
    return player


def search_players(db: Session, me: Utilisateur, search: str | None, limit: int = 20) -> list[Utilisateur]:
    query = select(Utilisateur).where(Utilisateur.role == Role.JOUEUR, Utilisateur.id != me.id)
    if search:
        query = query.where(Utilisateur.pseudo.ilike(f"%{search.strip()}%"))
    return list(db.scalars(query.order_by(Utilisateur.pseudo).limit(limit)))


def tradeable_cards(db: Session, player_id: uuid.UUID) -> tuple[Utilisateur, list[Collection]]:
    """Cartes possédées par le joueur (au moins 1 exemplaire)."""
    player = get_player(db, player_id)
    rows = db.scalars(
        select(Collection)
        .join(Creature, Creature.id == Collection.creature_id)
        .where(Collection.utilisateur_id == player.id, Collection.quantite >= 1)
        .order_by(Creature.nom)
    )
    return player, list(rows)
