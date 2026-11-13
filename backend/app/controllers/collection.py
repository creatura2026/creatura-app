"""UC-06 / UC-07 : collection personnelle, et opérations atomiques sur les exemplaires."""

import uuid

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.controllers.catalog import CATALOG_ORDER, filter_creatures, paginate
from app.controllers.catalog import _today as today_sql
from app.models import Collection, Creature, Famille, Rarete, Utilisateur
from app.schemas.auth import CollectionProgress
from app.schemas.base import PageParams, PageResult
from app.schemas.collection import Ownership


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


def progress(db: Session, user_id: uuid.UUID) -> CollectionProgress:
    total_creatures = db.scalar(select(func.count(Creature.id)).where(Creature.disponible_le <= today_sql())) or 0
    owned_creatures, total_cards = db.execute(
        select(
            func.count().filter(Collection.quantite >= 1),
            func.coalesce(func.sum(Collection.quantite), 0),
        ).where(Collection.utilisateur_id == user_id)
    ).one()
    completion = round(owned_creatures * 100 / total_creatures, 1) if total_creatures else 0.0
    return CollectionProgress(
        owned_creatures=owned_creatures,
        total_creatures=total_creatures,
        total_cards=total_cards,
        completion_percent=completion,
    )


def get_collection(
    db: Session,
    user: Utilisateur,
    params: PageParams,
    ownership: Ownership = Ownership.all,
    duplicates_only: bool = False,
    search: str | None = None,
    family: Famille | None = None,
    rarity: Rarete | None = None,
) -> PageResult:
    """Tout le catalogue, avec la quantité possédée par le joueur (0 = manquante).

    Lignes de la page : (Creature, quantité).
    """
    quantity = func.coalesce(Collection.quantite, 0)
    query = (
        select(Creature, quantity)
        .outerjoin(
            Collection,
            and_(Collection.creature_id == Creature.id, Collection.utilisateur_id == user.id),
        )
        .order_by(*CATALOG_ORDER)
    )
    query = filter_creatures(query, search, family, rarity)

    if ownership == Ownership.owned:
        query = query.where(quantity >= 1)
    elif ownership == Ownership.missing:
        query = query.where(quantity == 0)
    if duplicates_only:
        query = query.where(quantity >= 2)

    return paginate(db, query, params, scalars=False)
