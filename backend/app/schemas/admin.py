import datetime as dt

from pydantic import Field

from app.models import Reglage
from app.schemas.base import ApiInput, ApiModel
from app.schemas.catalog import RaritySummaryOut
from app.schemas.player import PlayerOut


class Period(ApiModel):
    # `from` est un mot réservé en Python : alias explicite.
    date_from: dt.date = Field(alias="from")
    date_to: dt.date = Field(alias="to")


class DailyCount(ApiModel):
    date: dt.date
    count: int


class Registrations(ApiModel):
    total: int  # joueurs inscrits depuis le lancement (jusqu'à la fin de la période)
    in_period: int


class CompletedTrades(ApiModel):
    in_period: int  # échanges acceptés sur la période
    per_day: list[DailyCount]


class AdminStatsOut(ApiModel):
    period: Period
    registrations: Registrations
    # Sans table booster, seul le dernier booster de chaque joueur est connu : c'est un minimum.
    boosters_opened_per_day: list[DailyCount]
    completed_trades: CompletedTrades


class RarityDistributionItem(ApiModel):
    rarity: RaritySummaryOut
    expected_rate: float  # probabilité de tirage actuelle (0 à 1)
    observed_count: int
    observed_rate: float  # part réellement observée (0 à 1)


class RarityDistributionOut(ApiModel):
    period: Period
    total_cards_distributed: int
    items: list[RarityDistributionItem]


class BoosterSettingsOut(ApiModel):
    cards_per_booster: int
    updated_at: dt.datetime | None
    updated_by: PlayerOut | None

    @classmethod
    def of(cls, r: Reglage) -> "BoosterSettingsOut":
        return cls(
            cards_per_booster=r.cartes_par_booster,
            updated_at=r.modifie_le,
            updated_by=PlayerOut.of(r.modifie_par) if r.modifie_par else None,
        )


class BoosterSettingsIn(ApiInput):
    cards_per_booster: int = Field(ge=1, le=10)
