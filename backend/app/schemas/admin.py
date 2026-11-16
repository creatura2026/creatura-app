import datetime as dt

from pydantic import Field

from app.models import Creature, Famille, Rarete, RareteTirage, Reglage
from app.schemas.base import ApiInput, ApiModel
from app.schemas.catalog import RARITY_CODES, CreatureOut, RarityCode, RaritySummaryOut
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


class ScheduledBoosterSettings(ApiModel):
    """Réglages enregistrés par l'administrateur, appliqués au prochain minuit."""

    cards_per_booster: int
    rarity_weights: dict[RarityCode, int]
    effective_from: dt.date


class BoosterSettingsOut(ApiModel):
    cards_per_booster: int  # en vigueur aujourd'hui
    rarity_weights: dict[RarityCode, int]  # poids de tirage en vigueur aujourd'hui
    scheduled: ScheduledBoosterSettings | None  # changement prévu au prochain minuit
    updated_at: dt.datetime | None
    updated_by: PlayerOut | None

    @classmethod
    def of(cls, r: Reglage, rows: list[RareteTirage]) -> "BoosterSettingsOut":
        by_rarete = {row.rarete: row for row in rows}
        scheduled = None
        if r.suivant_a_partir_du is not None:
            scheduled = ScheduledBoosterSettings(
                cards_per_booster=r.cartes_par_booster_suivant or r.cartes_par_booster,
                rarity_weights={
                    RARITY_CODES[x]: by_rarete[x].poids if by_rarete[x].poids_suivant is None else by_rarete[x].poids_suivant
                    for x in Rarete
                },
                effective_from=r.suivant_a_partir_du,
            )
        return cls(
            cards_per_booster=r.cartes_par_booster,
            rarity_weights={RARITY_CODES[x]: by_rarete[x].poids for x in Rarete},
            scheduled=scheduled,
            updated_at=r.modifie_le,
            updated_by=PlayerOut.of(r.modifie_par) if r.modifie_par else None,
        )


MAX_RARITY_WEIGHT = 1000


class BoosterSettingsIn(ApiInput):
    cards_per_booster: int = Field(ge=3, le=10)
    # Facultatif : les quatre raretés, de 0 à 1000. 0 retire une rareté du tirage.
    rarity_weights: dict[RarityCode, int] | None = None


# ── Cartes du catalogue (administration) ───────────────────────────────────

IMAGE_KEY = r"^sprites/[a-z0-9_-]+\.png$"  # fichier déjà présent sur le CDN (dossier sprites/)
MAX_LIMITED_STOCK = 100_000


class ScheduledRarityChange(ApiModel):
    rarity: RaritySummaryOut
    stock: int | None  # exemplaires de l'édition limitée (légendaire), sinon null
    effective_from: dt.date


class AdminCreatureOut(CreatureOut):
    image: str  # clé du fichier sur le CDN
    stock_total: int | None  # légendaire : exemplaires de l'édition limitée ; null = illimité
    stock_remaining: int | None
    available_from: dt.date  # jour où la carte devient visible et tirable
    scheduled_change: ScheduledRarityChange | None

    @classmethod
    def of(cls, c: Creature) -> "AdminCreatureOut":
        change = None
        if c.changement_le is not None and c.rarete_suivante is not None:
            change = ScheduledRarityChange(
                rarity=RaritySummaryOut.of(c.rarete_suivante), stock=c.stock_suivant, effective_from=c.changement_le
            )
        return cls(
            **cls._fields(c),
            description=c.description or "",
            image=c.image,
            stock_total=c.stock_total,
            stock_remaining=c.stock_restant,
            available_from=c.disponible_le,
            scheduled_change=change,
        )


class AdminCreatureIn(ApiInput):
    """Nouvelle carte, visible et tirable à partir du prochain minuit."""

    name: str = Field(min_length=2, max_length=50)
    description: str = Field(default="", max_length=500)
    family: Famille
    rarity: RarityCode
    image: str = Field(pattern=IMAGE_KEY)
    # Édition limitée : obligatoire pour une légendaire (nombre d'exemplaires), interdit sinon.
    stock: int | None = Field(default=None, ge=1, le=MAX_LIMITED_STOCK)


class RarityChangeIn(ApiInput):
    """Nouvelle rareté d'une carte existante, appliquée au prochain minuit."""

    rarity: RarityCode
    stock: int | None = Field(default=None, ge=1, le=MAX_LIMITED_STOCK)
