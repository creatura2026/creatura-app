"""Collection — UC-06, UC-07."""

from fastapi import APIRouter

from app.controllers import collection
from app.dependencies import CurrentUser, DbSession
from app.models import Famille, Rarete
from app.schemas.collection import CollectionFilter, CollectionOut

router = APIRouter(tags=["Collection"])


@router.get("/me/collection", response_model=CollectionOut)
def my_collection(
    user: CurrentUser,
    db: DbSession,
    status: CollectionFilter = CollectionFilter.all,
    search: str | None = None,
    family: Famille | None = None,
    rarity: Rarete | None = None,
):
    """Progression et cartes du joueur.

    `status` : `all` (tout le catalogue), `owned` (possédées), `missing` (manquantes),
    `duplicates` (doublons, au moins 2 exemplaires).
    """
    return collection.get_collection(db, user, status, search, family, rarity)
