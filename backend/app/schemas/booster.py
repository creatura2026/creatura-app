from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.catalog import CreatureOut


class BoosterTodayOut(BaseModel):
    available: bool
    day: date  # jour courant (heure de Paris)
    last_booster: date | None
    next_available_at: datetime | None  # minuit (Paris) si le booster du jour est déjà pris


class BoosterOpenedOut(BaseModel):
    day: date
    cards: list[CreatureOut]  # une entrée par carte tirée (doublons possibles)
