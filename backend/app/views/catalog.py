"""Catalogue — UC-05 et filtres."""

from fastapi import Depends, APIRouter, Query

from app.controllers import catalog
from app.dependencies import apply_scheduled_changes, CurrentUser, DbSession, Pagination
from app.models import Famille
from app.schemas.base import Page
from app.schemas.catalog import RARETE_OF, CreatureOut, FamilyOut, RarityCode, RarityOut

router = APIRouter(tags=["Catalogue"], dependencies=[Depends(apply_scheduled_changes)])

Search = Query(None, min_length=1, max_length=50, description="Nom de la créature, sans casse ni accents")


@router.get("/families", response_model=list[FamilyOut])
def list_families(_: CurrentUser):
    return catalog.list_families()


@router.get("/rarities", response_model=list[RarityOut])
def list_rarities(_: CurrentUser, db: DbSession):
    """Raretés et probabilité actuelle de tirage (les créatures épuisées sortent du tirage)."""
    return catalog.list_rarities(db)


@router.get("/creatures", response_model=Page[CreatureOut])
def list_creatures(
    _: CurrentUser,
    db: DbSession,
    page: Pagination,
    search: str | None = Search,
    family: Famille | None = None,
    rarity: RarityCode | None = None,
):
    """Toutes les créatures, possédées ou non : recherche par nom, filtres famille et rareté."""
    rarete = RARETE_OF[rarity] if rarity else None
    return Page[CreatureOut].of(catalog.list_creatures(db, page, search, family, rarete), CreatureOut.of)


@router.get("/creatures/{creatureId}", response_model=CreatureOut)
def get_creature(creatureId: str, _: CurrentUser, db: DbSession):  # noqa: N803 (nom du contrat)
    return CreatureOut.of(catalog.get_creature(db, creatureId))
