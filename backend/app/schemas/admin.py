from datetime import date

from pydantic import BaseModel

from app.models import Rarete


class Period(BaseModel):
    date_from: date
    date_to: date


class DailyTrades(BaseModel):
    day: date
    trades_accepted: int


class StatsOut(BaseModel):
    period: Period
    users_total: int
    players_total: int
    # Sans table booster, seul le jour courant est connu (dernier_booster) : stats partielles.
    boosters_today: int
    trades_accepted_in_period: int
    trades_pending: int
    daily: list[DailyTrades]


class RarityDistributionItem(BaseModel):
    rarity: Rarete
    label: str
    rank: int
    creatures_in_catalog: int
    expected_percent: float  # probabilité actuelle (créatures épuisées exclues)
    stock_total: int
    stock_remaining: int
    cards_drawn: int  # stock_total - stock_restant : cartes sorties des boosters
    observed_percent: float  # part réelle parmi toutes les cartes tirées


class RarityDistributionOut(BaseModel):
    cards_drawn: int
    items: list[RarityDistributionItem]
