"""UC-05 : catalogue des créatures, familles et raretés."""

import unicodedata

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import Creature, Famille, Rarete
from app.schemas.base import PageParams, PageResult
from app.schemas.catalog import RARITY_CODES, RARITY_LABELS, RARITY_RANK, FamilyOut, RarityOut

# Recherche « sans tenir compte de la casse ni des accents » (contrat) : la base n'a pas
# l'extension unaccent, on retire les accents français avec translate().
_ACCENTS = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿ"
_PLAIN = "aaaaaaceeeeiiiinooooouuuuyy"


def normalize(text: str) -> str:
    """Minuscules sans accents, comme `plain()` côté SQL."""
    decomposed = unicodedata.normalize("NFD", text.strip().lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def plain(column):
    return func.translate(func.lower(column), _ACCENTS, _PLAIN)


def parse_creature_id(value: str) -> int:
    """Les créatures sont numérotées en base ; l'API les expose en texte."""
    if not value.isdigit():
        raise NotFound("Cette créature n'existe pas.")
    return int(value)


# Ordre d'affichage du front : famille, rareté (de la plus commune à la plus rare), nom.
_FAMILY_ORDER = case({f.value: i for i, f in enumerate(Famille)}, value=Creature.famille)
_RARITY_ORDER = case({r.value: RARITY_RANK[r] for r in Rarete}, value=Creature.rarete)
CATALOG_ORDER = (_FAMILY_ORDER, _RARITY_ORDER, Creature.nom)


def filter_creatures(
    query: Select, search: str | None, family: Famille | None, rarity: Rarete | None
) -> Select:
    if search and (needle := normalize(search)):
        query = query.where(plain(Creature.nom).contains(needle, autoescape=True))
    if family is not None:
        query = query.where(Creature.famille == family)
    if rarity is not None:
        query = query.where(Creature.rarete == rarity)
    return query


def paginate(db: Session, query: Select, params: PageParams, *, scalars: bool = True) -> PageResult:
    """Exécute une page de `query` et compte le total (même filtre, sans tri)."""
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    page = query.limit(params.page_size).offset(params.offset)
    rows = list(db.scalars(page)) if scalars else list(db.execute(page).all())
    return PageResult(rows=rows, total=total, params=params)


def list_creatures(
    db: Session,
    params: PageParams,
    search: str | None = None,
    family: Famille | None = None,
    rarity: Rarete | None = None,
) -> PageResult:
    query = filter_creatures(select(Creature).order_by(*CATALOG_ORDER), search, family, rarity)
    return paginate(db, query, params)


def get_creature(db: Session, creature_id: str) -> Creature:
    creature = db.get(Creature, parse_creature_id(creature_id))
    if creature is None:
        raise NotFound("Cette créature n'existe pas.")
    return creature


def list_families() -> list[FamilyOut]:
    return [FamilyOut.of(f) for f in Famille]


def rarity_drop_rates(db: Session) -> dict[Rarete, float]:
    """Probabilité actuelle (0 à 1) de tirer chaque rareté.

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
    return {r: round(weights.get(r, 0) / total, 4) if total else 0.0 for r in Rarete}


def list_rarities(db: Session) -> list[RarityOut]:
    rates = rarity_drop_rates(db)
    return [
        RarityOut(code=RARITY_CODES[r], label=RARITY_LABELS[r], rank=RARITY_RANK[r], drop_rate=rates[r])
        for r in Rarete
    ]
