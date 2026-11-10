"""UC-12 à UC-14 : tableau de bord administrateur (consultation uniquement).

Sans table booster, l'historique des boosters n'existe pas : on ne connaît que le nombre de
joueurs ayant ouvert leur booster aujourd'hui (`dernier_booster`). La répartition des raretés
se calcule à partir des stocks (cartes sorties = stock_total - stock_restant).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.controllers.booster import today
from app.controllers.catalog import rarity_drop_rates
from app.errors import BadRequest
from app.models import Creature, Echange, Rarete, Role, Statut, Utilisateur
from app.schemas.admin import (
    DailyTrades,
    Period,
    RarityDistributionItem,
    RarityDistributionOut,
    StatsOut,
)
from app.schemas.catalog import RARITY_LABELS, RARITY_RANK

DEFAULT_PERIOD_DAYS = 7
MAX_PERIOD_DAYS = 366


def resolve_period(db: Session, date_from: date | None, date_to: date | None) -> Period:
    """Période inclusive. Par défaut : les 7 derniers jours, aujourd'hui compris (heure de Paris)."""
    date_to = date_to or today(db)
    date_from = date_from or date_to - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
    if date_from > date_to:
        raise BadRequest("La date de début doit précéder la date de fin")
    if (date_to - date_from).days >= MAX_PERIOD_DAYS:
        raise BadRequest(f"Période limitée à {MAX_PERIOD_DAYS} jours")
    return Period(date_from=date_from, date_to=date_to)


def _local_day(column):
    """Jour (heure de Paris) d'un timestamptz, calculé par Postgres."""
    return cast(func.timezone(get_settings().timezone, column), Date)


def stats(db: Session, period: Period) -> StatsOut:
    users_total = db.scalar(select(func.count()).select_from(Utilisateur))
    players_total = db.scalar(select(func.count()).where(Utilisateur.role == Role.JOUEUR))
    boosters_today = db.scalar(select(func.count()).where(Utilisateur.dernier_booster == today(db)))
    trades_pending = db.scalar(select(func.count()).where(Echange.statut == Statut.EN_ATTENTE))

    day = _local_day(Echange.decide_le)
    accepted_per_day = dict(
        db.execute(
            select(day, func.count())
            .where(Echange.statut == Statut.ACCEPTE, day.between(period.date_from, period.date_to))
            .group_by(day)
        ).all()
    )
    days = [
        period.date_from + timedelta(days=i)
        for i in range((period.date_to - period.date_from).days + 1)
    ]
    return StatsOut(
        period=period,
        users_total=users_total,
        players_total=players_total,
        boosters_today=boosters_today,
        trades_accepted_in_period=sum(accepted_per_day.values()),
        trades_pending=trades_pending,
        daily=[DailyTrades(day=d, trades_accepted=accepted_per_day.get(d, 0)) for d in days],
    )


def list_trades(
    db: Session,
    period: Period,
    status: Statut | None = None,
    player_id: uuid.UUID | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Echange]:
    query = select(Echange).where(_local_day(Echange.cree_le).between(period.date_from, period.date_to))
    if status is not None:
        query = query.where(Echange.statut == status)
    if player_id is not None:
        query = query.where(or_(Echange.proposeur_id == player_id, Echange.destinataire_id == player_id))
    query = query.order_by(Echange.cree_le.desc(), Echange.id).limit(limit).offset(offset)
    return list(db.scalars(query))


def rarity_distribution(db: Session) -> RarityDistributionOut:
    """Compare la probabilité de chaque rareté aux cartes réellement sorties des boosters."""
    rows = {
        rarete: (count, total, remaining)
        for rarete, count, total, remaining in db.execute(
            select(
                Creature.rarete,
                func.count(),
                func.sum(Creature.stock_total),
                func.sum(Creature.stock_restant),
            ).group_by(Creature.rarete)
        ).all()
    }
    expected = rarity_drop_rates(db)
    drawn = {r: (rows[r][1] - rows[r][2]) if r in rows else 0 for r in Rarete}
    total_drawn = sum(drawn.values())

    items = [
        RarityDistributionItem(
            rarity=r,
            label=RARITY_LABELS[r],
            rank=RARITY_RANK[r],
            creatures_in_catalog=rows.get(r, (0, 0, 0))[0],
            expected_percent=expected[r],
            stock_total=rows.get(r, (0, 0, 0))[1],
            stock_remaining=rows.get(r, (0, 0, 0))[2],
            cards_drawn=drawn[r],
            observed_percent=round(drawn[r] * 100 / total_drawn, 2) if total_drawn else 0.0,
        )
        for r in Rarete
    ]
    return RarityDistributionOut(cards_drawn=total_drawn, items=items)
