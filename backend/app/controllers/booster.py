"""UC-03 / UC-04 : booster quotidien.

- Un booster par compte et par jour : `utilisateur.dernier_booster`, verrouillé puis mis à jour
  dans la transaction du booster, le jour étant calculé par Postgres à l'heure de Paris.
- Tirage : `app.draw.draw_booster` (fonction pure) avec les poids de `rarete_tirage` et le stock
  des légendaires. Règles : rareté selon les poids puis créature au hasard, au plus une rare ou
  une légendaire par booster, rare garantie au premier booster, plus rare révélée en dernier.
- Seules les légendaires ont un stock : chaque exemplaire tiré décrémente
  `creature.stock_restant`. Si un autre booster a pris le dernier exemplaire entre le tirage et
  l'écriture, tout est annulé et retiré (au plus MAX_ATTEMPTS fois).
- Chaque carte est enregistrée dans `booster_carte` (historique : statistiques, taux observé).
- Tout se fait dans une transaction : `stock_total = stock_restant + Σ collections` reste vrai
  pour les légendaires.
"""

import random
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, insert, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app import draw
from app.config import get_settings
from app.controllers import collection
from app.controllers.catalog import rarity_weights
from app.errors import Conflict
from app.models import BoosterCarte, Collection, Creature, MotifTirage, Reglage, Utilisateur
from app.schemas.booster import BoosterCardOut, BoosterOut, BoosterTodayOut
from app.schemas.catalog import CreatureSummaryOut

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
    """Prochain minuit (heure de Paris), exprimé en UTC."""
    local = datetime.combine(day + timedelta(days=1), time.min, tzinfo=ZoneInfo(get_settings().timezone))
    return local.astimezone(timezone.utc)


def settings(db: Session) -> Reglage:
    reglage = db.get(Reglage, Reglage.ID)
    if reglage is None:  # ligne créée par db/init/04_evolution_reglage_echec.sql
        raise RuntimeError("Réglages absents : appliquer les scripts de db/ (appliquer.sh)")
    return reglage


def available_today(user: Utilisateur, day: date) -> bool:
    return user.dernier_booster is None or user.dernier_booster < day


def get_today(db: Session, user: Utilisateur) -> BoosterTodayOut:
    day = today(db)
    return BoosterTodayOut(
        claim_date=day,
        available=available_today(user, day),
        next_available_at=_next_midnight(day),
        cards_per_booster=settings(db).cartes_par_booster,
        booster=None,  # le booster du jour n'est pas réaffiché (son contenu est dans booster_carte)
    )


def _draw(db: Session, count: int, first_booster: bool) -> tuple[list[draw.DrawnCard], dict[int, Creature]]:
    """Tire les cartes d'un booster ; renvoie aussi les créatures du catalogue, par id."""
    creatures = {c.id: c for c in db.scalars(select(Creature))}
    candidates = [draw.Candidate(c.id, c.rarete.value, c.stock_restant) for c in creatures.values()]
    weights = {r.value: w for r, w in rarity_weights(db).items()}
    cards = draw.draw_booster(candidates, weights, count, first_booster=first_booster, rng=_rng)
    return cards, creatures


def _open_once(db: Session, user: Utilisateur) -> BoosterOut:
    # 1. Réserver le booster du jour. La ligne utilisateur reste verrouillée jusqu'au commit :
    #    une requête simultanée du même joueur attend, puis voit le booster déjà pris.
    day = today(db)
    last = db.execute(
        select(Utilisateur.dernier_booster).where(Utilisateur.id == user.id).with_for_update()
    ).scalar_one()
    if last is not None and last >= day:
        db.rollback()
        raise Conflict(
            "Le booster du jour a déjà été ouvert. Prochain booster à partir de minuit (heure de Paris).",
            "BOOSTER_ALREADY_CLAIMED",
        )
    first_booster = last is None  # jamais de booster : une rare garantie
    db.execute(
        update(Utilisateur)
        .where(Utilisateur.id == user.id)
        .values(dernier_booster=day)
        .execution_options(synchronize_session=False)
    )

    # 2. Tirer les cartes, au nombre réglé par l'administrateur.
    cards, creatures = _draw(db, settings(db).cartes_par_booster, first_booster)
    if not cards:
        db.rollback()  # annule aussi la réservation : le joueur ne perd pas son booster
        raise Conflict("Toutes les créatures tirables sont épuisées : booster annulé, réessayez plus tard.")

    # Créatures déjà possédées avant ce booster (pour signaler les nouvelles).
    counts = Counter(c.creature_id for c in cards)
    owned = set(
        db.scalars(
            select(Collection.creature_id).where(
                Collection.utilisateur_id == user.id,
                Collection.creature_id.in_(counts),
                Collection.quantite > 0,
            )
        )
    )

    # 3. Sortir les légendaires du stock et ajouter les cartes à la collection.
    #    Ordre fixe (id croissant) pour éviter les interblocages entre boosters simultanés.
    for creature_id in sorted(counts):
        qty = counts[creature_id]
        if creatures[creature_id].stock_restant is not None:
            taken = db.execute(
                update(Creature)
                .where(Creature.id == creature_id, Creature.stock_restant >= qty)
                .values(stock_restant=Creature.stock_restant - qty)
                .execution_options(synchronize_session=False)
            ).rowcount
            if taken != 1:
                raise _StockChanged
        collection.add_cards(db, user.id, creature_id, qty)

    # 4. Historique du tirage.
    booster_id = uuid.uuid4()
    db.execute(
        insert(BoosterCarte),
        [
            {
                "booster_id": booster_id,
                "position": position,
                "utilisateur_id": user.id,
                "jour": day,
                "creature_id": card.creature_id,
                "rarete": card.rarity,
                "motif": MotifTirage(card.reason),
            }
            for position, card in enumerate(cards, start=1)
        ],
    )
    db.commit()

    set_committed_value(user, "dernier_booster", day)  # met à jour l'objet sans le marquer modifié

    booster_cards = []
    for card in cards:
        creature = creatures[card.creature_id]
        booster_cards.append(
            BoosterCardOut(creature=CreatureSummaryOut.of(creature), is_new=creature.id not in owned)
        )
        owned.add(creature.id)  # un deuxième exemplaire du même booster n'est plus « nouveau »
    return BoosterOut(id=booster_id, claim_date=day, opened_at=datetime.now(timezone.utc), cards=booster_cards)


def open_booster(db: Session, user: Utilisateur) -> BoosterOut:
    for _ in range(MAX_ATTEMPTS):
        try:
            return _open_once(db, user)
        except _StockChanged:
            db.rollback()  # stock modifié entre-temps : on retire avec le stock à jour
    raise Conflict("Trop de boosters ouverts en même temps, réessayez.")
