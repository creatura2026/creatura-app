"""Changements de l'administrateur, appliqués au prochain minuit (heure de Paris).

Réglages des boosters, nouvelles créatures et changements de rareté sont enregistrés avec une
date d'effet (le lendemain) ; la fonction SQL `creatura_appliquer_changements`
(db/init/08_evolution_changements_planifies.sql) les applique quand cette date arrive. Le back
l'appelle avant de lire ces données (dépendance `apply_scheduled_changes` des routeurs).
"""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.controllers.booster import today, today_sql


def apply_due(db: Session) -> None:
    db.execute(select(func.creatura_appliquer_changements(today_sql())))
    db.commit()


def next_midnight_day(db: Session) -> date:
    """Jour d'effet des changements faits aujourd'hui : demain, heure de Paris."""
    return today(db) + timedelta(days=1)


def visible(column=None):
    """Condition « créature visible et tirable aujourd'hui » (disponible_le <= aujourd'hui)."""
    from app.models import Creature

    return (column if column is not None else Creature.disponible_le) <= today_sql()
