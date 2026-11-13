"""UC-12 à UC-14 : tableau de bord administrateur, et réglage des boosters.

Boosters ouverts par jour et répartition observée des raretés viennent de l'historique des
tirages (`booster_carte`, une ligne par carte, rare garantie du premier booster comprise), sur la
période demandée. Le taux attendu est le calcul exact de `app.draw.expected_card_rates` (règle
d'exclusion rare / légendaire comprise, sans la garantie du premier booster).

Toute modification (réglages des boosters, nouvelle carte, rareté d'une carte) s'applique au
prochain minuit, heure de Paris (`app.controllers.planning`).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import Date, cast, func, or_, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.controllers.booster import settings as booster_settings
from app.controllers.booster import today
from app.controllers.catalog import CATALOG_ORDER, parse_creature_id, paginate, rarity_drop_rates, rarity_weights
from app.controllers.planning import next_midnight_day
from app.errors import BadRequest, NotFound, field_error
from app.models import BoosterCarte, Creature, Echange, Rarete, RareteTirage, Reglage, Role, Statut, Utilisateur
from app.schemas.admin import AdminCreatureIn, RarityChangeIn
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
    """Compare la probabilité de chaque rareté à toutes les cartes sorties des boosters sur la
    période, rare garantie du premier booster comprise."""
    drawn = dict(
        db.execute(
            select(BoosterCarte.rarete, func.count())
            .where(BoosterCarte.jour.between(period.date_from, period.date_to))
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


def _weight_rows(db: Session) -> list[RareteTirage]:
    return list(db.scalars(select(RareteTirage)))


def get_booster_settings(db: Session) -> tuple[Reglage, list[RareteTirage]]:
    return booster_settings(db), _weight_rows(db)


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
) -> tuple[Reglage, list[RareteTirage]]:
    """Enregistre les réglages pour le prochain minuit ; les boosters du jour ne changent pas.

    Une nouvelle modification le même jour remplace la précédente.
    """
    by_rarete = _check_weights(weights) if weights is not None else None
    reglage = booster_settings(db)
    reglage.cartes_par_booster_suivant = cards_per_booster
    reglage.suivant_a_partir_du = next_midnight_day(db)
    reglage.modifie_le = func.now()
    reglage.modifie_par_id = admin.id
    for row in _weight_rows(db):
        row.poids_suivant = by_rarete[row.rarete] if by_rarete is not None else row.poids_suivant
    db.commit()
    db.refresh(reglage)
    return reglage, _weight_rows(db)


# ── Cartes du catalogue ───────────────────────────────────────────────────


def _check_stock(rarete: Rarete, stock: int | None) -> None:
    if rarete == Rarete.LEGENDAIRE and stock is None:
        raise field_error(
            "VALIDATION_ERROR", "stock", "Une légendaire est une édition limitée : indiquez le nombre d'exemplaires."
        )
    if rarete != Rarete.LEGENDAIRE and stock is not None:
        raise field_error("VALIDATION_ERROR", "stock", "Seule une légendaire (édition limitée) a un nombre d'exemplaires.")


def list_creatures(db: Session) -> list[Creature]:
    """Toutes les cartes, y compris celles qui n'apparaissent qu'au prochain minuit."""
    return list(db.scalars(select(Creature).order_by(*CATALOG_ORDER)))


def get_creature(db: Session, creature_id: str) -> Creature:
    creature = db.get(Creature, parse_creature_id(creature_id))
    if creature is None:
        raise NotFound("Cette créature n'existe pas.")
    return creature


def create_creature(db: Session, data: AdminCreatureIn) -> Creature:
    """Nouvelle carte, visible et tirable à partir du prochain minuit."""
    rarete = RARETE_OF[data.rarity]
    _check_stock(rarete, data.stock)
    creature = Creature(
        nom=data.name.strip(),
        description=data.description.strip() or None,
        famille=data.family,
        rarete=rarete,
        image=data.image,
        stock_total=data.stock,
        stock_restant=data.stock,
        disponible_le=next_midnight_day(db),
    )
    db.add(creature)
    db.commit()  # nom déjà pris : uq_creature_nom, traduit en erreur de champ (app.errors)
    db.refresh(creature)
    return creature


def schedule_rarity_change(db: Session, creature_id: str, data: RarityChangeIn) -> Creature:
    """Nouvelle rareté (et stock si légendaire) appliquée au prochain minuit.

    Les exemplaires déjà possédés restent dans les collections. Une carte qui devient légendaire
    reçoit `stock` nouveaux exemplaires à tirer ; une légendaire qui change de rareté devient
    illimitée.
    """
    creature = get_creature(db, creature_id)
    rarete = RARETE_OF[data.rarity]
    _check_stock(rarete, data.stock)
    if rarete == creature.rarete and rarete != Rarete.LEGENDAIRE:
        raise field_error("VALIDATION_ERROR", "rarity", "La carte a déjà cette rareté.")
    creature.rarete_suivante = rarete
    creature.stock_suivant = data.stock
    creature.changement_le = next_midnight_day(db)
    db.commit()
    db.refresh(creature)
    return creature


def cancel_rarity_change(db: Session, creature_id: str) -> Creature:
    creature = get_creature(db, creature_id)
    creature.rarete_suivante = creature.stock_suivant = creature.changement_le = None
    db.commit()
    db.refresh(creature)
    return creature
