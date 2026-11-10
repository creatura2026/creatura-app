"""UC-03 / UC-04 : booster quotidien.

- Un booster par compte et par jour : UPDATE conditionnel sur `utilisateur.dernier_booster`,
  le jour étant calculé par Postgres à l'heure de Paris (RDS est en UTC).
- Stock global : chaque carte tirée décrémente `creature.stock_restant` ; une créature épuisée
  sort du tirage. Si tout est épuisé, le booster est annulé et le joueur ne le perd pas.
- Tout se fait dans une transaction : `stock_total = stock_restant + Σ collections` reste vrai.
"""

import random
from collections import Counter
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.config import get_settings
from app.controllers import collection
from app.errors import Conflict
from app.models import Creature, Utilisateur
from app.schemas.booster import BoosterOpenedOut, BoosterTodayOut
from app.schemas.catalog import CreatureOut

_rng = random.SystemRandom()
MAX_ATTEMPTS = 3


class _StockChanged(Exception):
    """Un autre booster a pris le dernier exemplaire entre le tirage et l'écriture."""


def today_sql():
    """Date du jour à l'heure de Paris, calculée par Postgres."""
    return cast(func.timezone(get_settings().timezone, func.now()), Date)


def today(db: Session) -> date:
    return db.scalar(select(today_sql()))


def _next_midnight(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), time.min, tzinfo=ZoneInfo(get_settings().timezone))


def get_today(db: Session, user: Utilisateur) -> BoosterTodayOut:
    day = today(db)
    available = user.dernier_booster is None or user.dernier_booster < day
    return BoosterTodayOut(
        available=available,
        day=day,
        last_booster=user.dernier_booster,
        next_available_at=None if available else _next_midnight(day),
    )


def _draw(db: Session, count: int) -> list[Creature]:
    """Tire jusqu'à `count` cartes, selon le poids, parmi les créatures encore en stock."""
    pool = {c.id: c for c in db.scalars(select(Creature).where(Creature.stock_restant > 0))}
    left = {cid: c.stock_restant for cid, c in pool.items()}
    drawn: list[Creature] = []
    for _ in range(count):
        ids = [cid for cid, n in left.items() if n > 0]
        if not ids:
            break  # stock épuisé : booster partiel
        cid = _rng.choices(ids, weights=[pool[i].poids for i in ids])[0]
        left[cid] -= 1
        drawn.append(pool[cid])
    return drawn


def _open_once(db: Session, user: Utilisateur) -> BoosterOpenedOut:
    # 1. Réserver le booster du jour. La ligne utilisateur reste verrouillée jusqu'au commit :
    #    une requête simultanée du même joueur attend, puis ne trouve plus de ligne à modifier.
    day = db.execute(
        update(Utilisateur)
        .where(
            Utilisateur.id == user.id,
            or_(Utilisateur.dernier_booster.is_(None), Utilisateur.dernier_booster < today_sql()),
        )
        .values(dernier_booster=today_sql())
        .returning(Utilisateur.dernier_booster)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()
    if day is None:
        db.rollback()
        raise Conflict("Booster du jour déjà réclamé")

    # 2. Tirer les cartes.
    cards = _draw(db, get_settings().booster_size)
    if not cards:
        db.rollback()  # annule aussi la réservation : le joueur ne perd pas son booster
        raise Conflict("Toutes les créatures sont épuisées : booster annulé, réessayez plus tard")

    # 3. Sortir les cartes du stock et les ajouter à la collection.
    #    Ordre fixe (id croissant) pour éviter les interblocages entre boosters simultanés.
    counts = Counter(c.id for c in cards)
    for creature_id in sorted(counts):
        qty = counts[creature_id]
        taken = db.execute(
            update(Creature)
            .where(Creature.id == creature_id, Creature.stock_restant >= qty)
            .values(stock_restant=Creature.stock_restant - qty)
            .execution_options(synchronize_session=False)
        ).rowcount
        if taken != 1:
            raise _StockChanged
        collection.add_cards(db, user.id, creature_id, qty)
    db.commit()

    set_committed_value(user, "dernier_booster", day)  # met à jour l'objet sans le marquer modifié
    fresh = {
        c.id: c
        for c in db.scalars(
            select(Creature)
            .where(Creature.id.in_(counts))
            .execution_options(populate_existing=True)
        )
    }
    return BoosterOpenedOut(day=day, cards=[CreatureOut.of(fresh[c.id]) for c in cards])


def open_booster(db: Session, user: Utilisateur) -> BoosterOpenedOut:
    for _ in range(MAX_ATTEMPTS):
        try:
            return _open_once(db, user)
        except _StockChanged:
            db.rollback()  # stock modifié entre-temps : on retire avec le stock à jour
    raise Conflict("Trop de boosters ouverts en même temps, réessayez")
