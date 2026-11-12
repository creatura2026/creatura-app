"""UC-05 : catalogue des créatures, familles et raretés."""

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import Creature, Famille, Rarete
from app.schemas.catalog import FAMILY_LABELS, RARITY_LABELS, RARITY_RANK, FamilyOut, RarityOut


def filter_creatures(
    query: Select, search: str | None, family: Famille | None, rarity: Rarete | None
) -> Select:
    if search:
        query = query.where(Creature.nom.ilike(f"%{search.strip()}%"))
    if family is not None:
        query = query.where(Creature.famille == family)
    if rarity is not None:
        query = query.where(Creature.rarete == rarity)
    return query


def list_creatures(
    db: Session,
    search: str | None = None,
    family: Famille | None = None,
    rarity: Rarete | None = None,
) -> list[Creature]:
    query = filter_creatures(select(Creature).order_by(Creature.id), search, family, rarity)
    return list(db.scalars(query))


def get_creature(db: Session, creature_id: int) -> Creature:
    creature = db.get(Creature, creature_id)
    if creature is None:
        raise NotFound("Créature introuvable")
    return creature


def list_families() -> list[FamilyOut]:
    return [FamilyOut(code=f, label=FAMILY_LABELS[f]) for f in Famille]


def rarity_drop_rates(db: Session) -> dict[Rarete, float]:
    """Probabilité actuelle de tirer chaque rareté (en %).

    Elle découle du poids des créatures encore en stock : une créature épuisée sort du tirage.
    """
    weights = dict(
        db.execute(
            select(Creature.rarete, func.sum(Creature.poids))
            .where(Creature.stock_restant > 0)
            .group_by(Creature.rarete)
        ).all()
    )
    total = sum(weights.values())
    return {r: round(weights.get(r, 0) * 100 / total, 2) if total else 0.0 for r in Rarete}


def list_rarities(db: Session) -> list[RarityOut]:
    rates = rarity_drop_rates(db)
    return [
        RarityOut(code=r, label=RARITY_LABELS[r], rank=RARITY_RANK[r], drop_rate_percent=rates[r])
        for r in Rarete
    ]
