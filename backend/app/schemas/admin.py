import datetime as dt

from pydantic import Field

from app.models import Rarete, Reglage
from app.schemas.base import ApiInput, ApiModel
from app.schemas.catalog import RARITY_CODES, RarityCode, RaritySummaryOut
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
    boosters_opened_per_day: list[DailyCount]  # historique booster_carte : chaque booster compte
    completed_trades: CompletedTrades


class RarityDistributionItem(ApiModel):
    rarity: RaritySummaryOut
    expected_rate: float  # probabilité de tirage actuelle (0 à 1), règle d'exclusion comprise
    observed_count: int
    observed_rate: float  # part réellement observée (0 à 1)


class RarityDistributionOut(ApiModel):
    period: Period
    total_cards_distributed: int  # cartes tirées selon les poids (sans la rare garantie du premier booster)
    items: list[RarityDistributionItem]


class BoosterSettingsOut(ApiModel):
    cards_per_booster: int
    rarity_weights: dict[RarityCode, int]  # poids de tirage de chaque rareté
    updated_at: dt.datetime | None
    updated_by: PlayerOut | None

    @classmethod
    def of(cls, r: Reglage, weights: dict[Rarete, int]) -> "BoosterSettingsOut":
        return cls(
            cards_per_booster=r.cartes_par_booster,
            rarity_weights={RARITY_CODES[r]: weights[r] for r in Rarete},
            updated_at=r.modifie_le,
            updated_by=PlayerOut.of(r.modifie_par) if r.modifie_par else None,
        )


MAX_RARITY_WEIGHT = 1000


class BoosterSettingsIn(ApiInput):
    cards_per_booster: int = Field(ge=3, le=10)
    # Facultatif : les quatre raretés, de 0 à 1000. 0 retire une rareté du tirage.
    rarity_weights: dict[RarityCode, int] | None = None
