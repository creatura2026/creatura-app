"""Booster — UC-03, UC-04."""

from fastapi import Depends, APIRouter, status

from app.controllers import booster
from app.dependencies import apply_scheduled_changes, PlayerUser, DbSession
from app.schemas.booster import BoosterOut, BoosterTodayOut

router = APIRouter(tags=["Booster"], dependencies=[Depends(apply_scheduled_changes)])


@router.get("/me/boosters/today", response_model=BoosterTodayOut)
def booster_today(user: PlayerUser, db: DbSession):
    """Disponibilité du booster du jour et nombre de cartes du prochain booster."""
    return booster.get_today(db, user)


@router.post("/me/boosters", response_model=BoosterOut, status_code=status.HTTP_201_CREATED)
def open_booster(user: PlayerUser, db: DbSession):
    """Réclame et ouvre le booster du jour : tirage et ajout à la collection en une transaction.

    409 `BOOSTER_ALREADY_CLAIMED` si le booster du jour est déjà pris ;
    409 `CARDS_UNAVAILABLE` si toutes les créatures sont épuisées (le booster n'est pas perdu).
    """
    return booster.open_booster(db, user)
