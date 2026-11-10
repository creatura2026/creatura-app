"""Booster — UC-03, UC-04."""

from fastapi import APIRouter, status

from app.controllers import booster
from app.dependencies import CurrentUser, DbSession
from app.schemas.booster import BoosterOpenedOut, BoosterTodayOut

router = APIRouter(tags=["Booster"])


@router.get("/me/boosters/today", response_model=BoosterTodayOut)
def booster_today(user: CurrentUser, db: DbSession):
    """Indique si le booster du jour est disponible."""
    return booster.get_today(db, user)


@router.post(
    "/me/boosters",
    response_model=BoosterOpenedOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Booster du jour déjà réclamé, ou toutes les créatures épuisées"}},
)
def open_booster(user: CurrentUser, db: DbSession):
    """Ouvre le booster du jour : les cartes tirées sont ajoutées à la collection."""
    return booster.open_booster(db, user)
