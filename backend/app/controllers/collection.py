"""UC-06 / UC-07 : collection personnelle, et opérations atomiques sur les exemplaires."""

import uuid

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.controllers.catalog import filter_creatures
from app.models import Collection, Creature, Famille, Rarete, Utilisateur
from app.schemas.auth import CollectionSummary
from app.schemas.catalog import CreatureOut
from app.schemas.collection import CollectionFilter, CollectionItemOut, CollectionOut


def add_cards(db: Session, user_id: uuid.UUID, creature_id: int, quantity: int) -> None:
    """Ajoute des exemplaires (INSERT … ON CONFLICT : atomique, même en concurrence)."""
    stmt = insert(Collection).values(utilisateur_id=user_id, creature_id=creature_id, quantite=quantity)
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=[Collection.utilisateur_id, Collection.creature_id],
            set_={"quantite": Collection.quantite + stmt.excluded.quantite},
        )
    )


def remove_cards(db: Session, user_id: uuid.UUID, creature_id: int, quantity: int) -> bool:
    """Retire des exemplaires seulement s'il y en a assez.

    La condition `quantite >= :q` est évaluée par Postgres sur la ligne verrouillée :
    deux transactions concurrentes ne peuvent pas consommer le même exemplaire.
    """
    result = db.execute(
        update(Collection)
        .where(
            Collection.utilisateur_id == user_id,
            Collection.creature_id == creature_id,
            Collection.quantite >= quantity,
        )
        .values(quantite=Collection.quantite - quantity)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def owned_quantity(db: Session, user_id: uuid.UUID, creature_id: int) -> int:
    qty = db.scalar(
        select(Collection.quantite).where(
            Collection.utilisateur_id == user_id, Collection.creature_id == creature_id
        )
    )
    return qty or 0


def summary(db: Session, user_id: uuid.UUID) -> CollectionSummary:
    total_creatures = db.scalar(select(func.count(Creature.id))) or 0
    owned = Collection.quantite >= 1
    owned_distinct, total_cards, duplicates = db.execute(
        select(
            func.count().filter(owned),
            func.coalesce(func.sum(Collection.quantite), 0),
            func.coalesce(func.sum(Collection.quantite - 1).filter(owned), 0),
        ).where(Collection.utilisateur_id == user_id)
    ).one()
    completion = round(owned_distinct * 100 / total_creatures, 1) if total_creatures else 0.0
    return CollectionSummary(
        owned_distinct=owned_distinct,
        total_creatures=total_creatures,
        completion_percent=completion,
        total_cards=total_cards,
        duplicates=duplicates,
    )


def get_collection(
    db: Session,
    user: Utilisateur,
    status: CollectionFilter = CollectionFilter.all,
    search: str | None = None,
    family: Famille | None = None,
    rarity: Rarete | None = None,
) -> CollectionOut:
    """Tout le catalogue, avec la quantité possédée par le joueur (0 = manquante)."""
    quantity = func.coalesce(Collection.quantite, 0)
    query = (
        select(Creature, quantity)
        .outerjoin(
            Collection,
            and_(Collection.creature_id == Creature.id, Collection.utilisateur_id == user.id),
        )
        .order_by(Creature.nom)
    )
    query = filter_creatures(query, search, family, rarity)

    if status == CollectionFilter.owned:
        query = query.where(quantity >= 1)
    elif status == CollectionFilter.missing:
        query = query.where(quantity == 0)
    elif status == CollectionFilter.duplicates:
        query = query.where(quantity >= 2)

    items = [
        CollectionItemOut(creature=CreatureOut.of(creature), quantity=qty)
        for creature, qty in db.execute(query).all()
    ]
    return CollectionOut(summary=summary(db, user.id), items=items)
