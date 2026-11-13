"""UC-12 à UC-14 : tableau de bord administrateur, et réglage des boosters.

Boosters ouverts par jour et répartition observée des raretés viennent de l'historique des
tirages (`booster_carte`, une ligne par carte), sur la période demandée. Le taux attendu est le
calcul exact de `app.draw.expected_card_rates` (règle d'exclusion rare / légendaire comprise).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import Date, cast, func, or_, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.controllers.booster import settings as booster_settings
from app.controllers.booster import today
from app.controllers.catalog import paginate, rarity_drop_rates, rarity_weights
from app.errors import BadRequest, field_error
from app.models import BoosterCarte, Echange, MotifTirage, Rarete, RareteTirage, Reglage, Role, Statut, Utilisateur
from app.schemas.admin import (
    AdminStatsOut,
    CompletedTrades,
    DailyCount,
    Period,
    RarityDistributionItem,
    RarityDistributionOut,
    Registrations,
)
from app.schemas.base import PageParams, PageResult
from app.schemas.catalog import RARETE_OF, RarityCode, RaritySummaryOut

DEFAULT_PERIOD_DAYS = 30
MAX_PERIOD_DAYS = 366


def resolve_period(db: Session, date_from: date | None, date_to: date | None) -> Period:
    """Période inclusive. Par défaut : les 30 derniers jours, aujourd'hui compris (heure de Paris)."""
    date_to = date_to or today(db)
    date_from = date_from or date_to - timedelta(days=DEFAULT_PERIOD_DAYS - 1)
    if date_from > date_to:
        raise BadRequest("La date de début doit précéder la date de fin.")
    if (date_to - date_from).days >= MAX_PERIOD_DAYS:
        raise BadRequest(f"La période ne peut pas dépasser {MAX_PERIOD_DAYS} jours.")
    return Period(date_from=date_from, date_to=date_to)


def _local_day(column):
    """Jour (heure de Paris) d'un timestamptz, calculé par Postgres."""
    return cast(func.timezone(get_settings().timezone, column), Date)


def _days(period: Period) -> list[date]:
    return [period.date_from + timedelta(days=i) for i in range((period.date_to - period.date_from).days + 1)]


def _per_day(period: Period, counts: dict[date, int]) -> list[DailyCount]:
    """Un point par jour de la période, à 0 les jours sans activité."""
    return [DailyCount(date=d, count=counts.get(d, 0)) for d in _days(period)]


def stats(db: Session, period: Period) -> AdminStatsOut:
    created = _local_day(Utilisateur.cree_le)
    players = select(func.count()).where(Utilisateur.role == Role.JOUEUR)
    registrations = Registrations(
        total=db.scalar(players.where(created <= period.date_to)),
        in_period=db.scalar(players.where(created.between(period.date_from, period.date_to))),
    )

    # Chaque booster compte, même si le joueur en ouvre un tous les jours.
    boosters = dict(
        db.execute(
            select(BoosterCarte.jour, func.count(BoosterCarte.booster_id.distinct()))
            .where(BoosterCarte.jour.between(period.date_from, period.date_to))
            .group_by(BoosterCarte.jour)
        ).all()
    )

    decided = _local_day(Echange.decide_le)
    accepted = dict(
        db.execute(
            select(decided, func.count())
            .where(Echange.statut == Statut.ACCEPTE, decided.between(period.date_from, period.date_to))
            .group_by(decided)
        ).all()
    )
    return AdminStatsOut(
        period=period,
        registrations=registrations,
        boosters_opened_per_day=_per_day(period, boosters),
        completed_trades=CompletedTrades(in_period=sum(accepted.values()), per_day=_per_day(period, accepted)),
    )


def list_trades(
    db: Session,
    period: Period,
    params: PageParams,
    status: Statut | None = None,
    player_id: uuid.UUID | None = None,
) -> PageResult:
    """Échanges créés dans la période, du plus récent au plus ancien."""
    query = select(Echange).where(_local_day(Echange.cree_le).between(period.date_from, period.date_to))
    if status is not None:
        query = query.where(Echange.statut == status)
    if player_id is not None:
        query = query.where(or_(Echange.proposeur_id == player_id, Echange.destinataire_id == player_id))
    return paginate(db, query.order_by(Echange.cree_le.desc(), Echange.id), params)


def rarity_distribution(db: Session, period: Period) -> RarityDistributionOut:
    """Compare la probabilité de chaque rareté aux cartes réellement tirées sur la période.

    Seules les cartes tirées selon les poids comptent : la rare garantie du premier booster
    fausserait le taux observé des rares.
    """
    drawn = dict(
        db.execute(
            select(BoosterCarte.rarete, func.count())
            .where(
                BoosterCarte.jour.between(period.date_from, period.date_to),
                BoosterCarte.motif == MotifTirage.TIRAGE,
            )
            .group_by(BoosterCarte.rarete)
        ).all()
    )
    expected = rarity_drop_rates(db)
    total = sum(drawn.values())
    return RarityDistributionOut(
        period=period,
        total_cards_distributed=total,
        items=[
            RarityDistributionItem(
                rarity=RaritySummaryOut.of(r),
                expected_rate=expected[r],
                observed_count=drawn.get(r, 0),
                observed_rate=round(drawn.get(r, 0) / total, 4) if total else 0.0,
            )
            for r in Rarete
        ],
    )


def get_booster_settings(db: Session) -> tuple[Reglage, dict[Rarete, int]]:
    return booster_settings(db), rarity_weights(db)


def _check_weights(weights: dict[RarityCode, int]) -> dict[Rarete, int]:
    if set(weights) != set(RarityCode):
        raise field_error("VALIDATION_ERROR", "rarityWeights", "Donnez le poids des quatre raretés.")
    if any(not 0 <= w <= 1000 for w in weights.values()):
        raise field_error("VALIDATION_ERROR", "rarityWeights", "Le poids d'une rareté va de 0 à 1000.")
    by_rarete = {RARETE_OF[code]: w for code, w in weights.items()}
    # Après une rare ou une légendaire, le booster se complète en communes et peu communes.
    if by_rarete[Rarete.COMMUN] + by_rarete[Rarete.PEU_COMMUN] == 0:
        raise field_error(
            "VALIDATION_ERROR", "rarityWeights", "Les communes et peu communes ne peuvent pas être toutes deux à 0."
        )
    return by_rarete


def update_booster_settings(
    db: Session, admin: Utilisateur, cards_per_booster: int, weights: dict[RarityCode, int] | None = None
) -> tuple[Reglage, dict[Rarete, int]]:
    """S'applique aux boosters ouverts après la modification."""
    by_rarete = _check_weights(weights) if weights is not None else None
    reglage = booster_settings(db)
    reglage.cartes_par_booster = cards_per_booster
    reglage.modifie_le = func.now()
    reglage.modifie_par_id = admin.id
    for rarete, poids in (by_rarete or {}).items():
        db.execute(update(RareteTirage).where(RareteTirage.rarete == rarete).values(poids=poids))
    db.commit()
    db.refresh(reglage)
    return reglage, rarity_weights(db)
