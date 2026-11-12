"""Catalogue — UC-05 et filtres."""

from fastapi import APIRouter

from app.controllers import catalog
from app.dependencies import CurrentUser, DbSession
from app.models import Famille, Rarete
from app.schemas.catalog import CreatureOut, FamilyOut, RarityOut

router = APIRouter(tags=["Catalogue"])


@router.get("/creatures", response_model=list[CreatureOut])
def list_creatures(
    _: CurrentUser,
    db: DbSession,
    search: str | None = None,
    family: Famille | None = None,
    rarity: Rarete | None = None,
):
    """Toutes les créatures, possédées ou non. Recherche par nom, filtre par famille et rareté."""
    return [CreatureOut.of(c) for c in catalog.list_creatures(db, search, family, rarity)]


@router.get("/creatures/{creature_id}", response_model=CreatureOut)
def get_creature(creature_id: int, _: CurrentUser, db: DbSession):
    return CreatureOut.of(catalog.get_creature(db, creature_id))


@router.get("/families", response_model=list[FamilyOut])
def list_families(_: CurrentUser):
    return catalog.list_families()


@router.get("/rarities", response_model=list[RarityOut])
def list_rarities(_: CurrentUser, db: DbSession):
    """Raretés avec leur probabilité actuelle de tirage (créatures épuisées exclues)."""
    return catalog.list_rarities(db)
