import uuid
from datetime import date, datetime

from pydantic import Field

from app.schemas.base import ApiModel
from app.schemas.catalog import CreatureSummaryOut


class BoosterCardOut(ApiModel):
    creature: CreatureSummaryOut
    is_new: bool  # le joueur ne possédait pas encore cette créature


class BoosterOut(ApiModel):
    id: uuid.UUID  # identifiant du booster dans l'historique (booster_carte.booster_id)
    claim_date: date  # jour du booster, heure de Paris
    opened_at: datetime
    cards: list[BoosterCardOut]


class BoosterTodayOut(ApiModel):
    claim_date: date
    available: bool
    next_available_at: datetime  # prochain minuit, heure de Paris
    cards_per_booster: int = Field(ge=3, le=10)
    # Booster déjà ouvert aujourd'hui : pas encore réaffiché, toujours null.
    booster: BoosterOut | None = None
