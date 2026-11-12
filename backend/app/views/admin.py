"""Administration — UC-12, UC-13, UC-14. Réservé au rôle administrateur."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.controllers import admin
from app.dependencies import DbSession, require_admin
from app.models import Statut
from app.schemas.admin import RarityDistributionOut, StatsOut
from app.schemas.trade import TradeOut

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

DateFrom = Query(None, alias="from", description="Début de période (inclus), AAAA-MM-JJ")
DateTo = Query(None, alias="to", description="Fin de période (incluse), AAAA-MM-JJ")


@router.get("/stats", response_model=StatsOut)
def stats(db: DbSession, date_from: date | None = DateFrom, date_to: date | None = DateTo):
    """Inscrits, boosters ouverts aujourd'hui, échanges finalisés par jour."""
    return admin.stats(db, admin.resolve_period(db, date_from, date_to))


@router.get("/trades", response_model=list[TradeOut])
def trades(
    db: DbSession,
    date_from: date | None = DateFrom,
    date_to: date | None = DateTo,
    status: Statut | None = None,
    player_id: uuid.UUID | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Échanges créés dans la période, filtrables par état et par joueur."""
    period = admin.resolve_period(db, date_from, date_to)
    return [TradeOut.of(t) for t in admin.list_trades(db, period, status, player_id, limit, offset)]


@router.get("/rarity-distribution", response_model=RarityDistributionOut)
def rarity_distribution(db: DbSession):
    """Cartes sorties des boosters par rareté (d'après les stocks), comparées aux probabilités."""
    return admin.rarity_distribution(db)
