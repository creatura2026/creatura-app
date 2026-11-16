"""Collection — UC-06, UC-07."""

from fastapi import Depends, APIRouter, Query

from app.controllers import collection
from app.dependencies import apply_scheduled_changes, PlayerUser, DbSession, Pagination
from app.models import Famille
from app.schemas.catalog import RARETE_OF, CreatureSummaryOut, RarityCode
from app.schemas.collection import CollectionEntryOut, CollectionPageOut, Ownership
from app.views.catalog import Search

router = APIRouter(tags=["Collection"], dependencies=[Depends(apply_scheduled_changes)])


@router.get("/me/collection", response_model=CollectionPageOut)
def my_collection(
    user: PlayerUser,
    db: DbSession,
    page: Pagination,
    search: str | None = Search,
    family: Famille | None = None,
    rarity: RarityCode | None = None,
    ownership: Ownership = Ownership.all,
    duplicates_only: bool = Query(False, alias="duplicatesOnly"),
):
    """Tout le catalogue avec la quantité possédée (0 = manquante), et la progression."""
    result = collection.get_collection(
        db, user, page, ownership, duplicates_only, search, family, RARETE_OF[rarity] if rarity else None
    )
    return CollectionPageOut.of(
        result,
        lambda row: CollectionEntryOut(creature=CreatureSummaryOut.of(row[0]), quantity=row[1]),
        progress=collection.progress(db, user.id),
    )
