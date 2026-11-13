"""Administration — UC-12, UC-13, UC-14 et réglages. Réservé au rôle ADMIN."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status

from app.controllers import admin
from app.dependencies import AdminUser, DbSession, Pagination, apply_scheduled_changes, require_admin
from app.schemas.admin import (
    AdminCreatureIn,
    AdminCreatureOut,
    AdminStatsOut,
    BoosterSettingsIn,
    BoosterSettingsOut,
    RarityChangeIn,
    RarityDistributionOut,
)
from app.schemas.base import Page
from app.schemas.trade import STATUT_OF, TradeOut, TradeStatus

router = APIRouter(
    prefix="/admin",
    tags=["Administration"],
    dependencies=[Depends(require_admin), Depends(apply_scheduled_changes)],
)

DateFrom = Query(None, alias="from", description="Premier jour inclus (30 jours avant `to` par défaut)")
DateTo = Query(None, alias="to", description="Dernier jour inclus (aujourd'hui par défaut), 366 jours au maximum")


@router.get("/stats", response_model=AdminStatsOut)
def stats(db: DbSession, date_from: date | None = DateFrom, date_to: date | None = DateTo):
    """Inscriptions, boosters ouverts par jour, échanges finalisés par jour."""
    return admin.stats(db, admin.resolve_period(db, date_from, date_to))


@router.get("/trades", response_model=Page[TradeOut])
def trades(
    db: DbSession,
    page: Pagination,
    date_from: date | None = DateFrom,
    date_to: date | None = DateTo,
    status: TradeStatus | None = None,
    player_id: uuid.UUID | None = Query(None, alias="playerId"),
):
    """Échanges créés dans la période, filtrables par état et par joueur."""
    period = admin.resolve_period(db, date_from, date_to)
    statut = STATUT_OF[status] if status else None
    return Page[TradeOut].of(admin.list_trades(db, period, page, statut, player_id), TradeOut.of)


@router.get("/rarity-distribution", response_model=RarityDistributionOut)
def rarity_distribution(db: DbSession, date_from: date | None = DateFrom, date_to: date | None = DateTo):
    """Cartes tirées sur la période par rareté (historique des boosters), comparées aux
    probabilités de tirage. La rare garantie du premier booster n'est pas comptée."""
    return admin.rarity_distribution(db, admin.resolve_period(db, date_from, date_to))


@router.get("/settings/booster", response_model=BoosterSettingsOut)
def get_booster_settings(db: DbSession):
    return BoosterSettingsOut.of(*admin.get_booster_settings(db))


@router.put("/settings/booster", response_model=BoosterSettingsOut)
def update_booster_settings(data: BoosterSettingsIn, user: AdminUser, db: DbSession):
    """Nombre de cartes par booster et poids des raretés, appliqués au prochain minuit (heure de Paris)."""
    return BoosterSettingsOut.of(*admin.update_booster_settings(db, user, data.cards_per_booster, data.rarity_weights))


@router.get("/creatures", response_model=list[AdminCreatureOut])
def list_creatures(db: DbSession):
    """Toutes les cartes, avec leur stock, leur date de disponibilité et le changement prévu."""
    return [AdminCreatureOut.of(c) for c in admin.list_creatures(db)]


@router.post("/creatures", response_model=AdminCreatureOut, status_code=status.HTTP_201_CREATED)
def create_creature(data: AdminCreatureIn, db: DbSession):
    """Nouvelle carte, visible et tirable au prochain minuit. Légendaire : édition limitée (stock)."""
    return AdminCreatureOut.of(admin.create_creature(db, data))


@router.put("/creatures/{creatureId}/rarity", response_model=AdminCreatureOut)
def schedule_rarity_change(creatureId: str, data: RarityChangeIn, db: DbSession):  # noqa: N803 (nom du contrat)
    """Nouvelle rareté d'une carte existante, appliquée au prochain minuit."""
    return AdminCreatureOut.of(admin.schedule_rarity_change(db, creatureId, data))


@router.delete("/creatures/{creatureId}/rarity", response_model=AdminCreatureOut)
def cancel_rarity_change(creatureId: str, db: DbSession):  # noqa: N803 (nom du contrat)
    """Annule le changement de rareté prévu."""
    return AdminCreatureOut.of(admin.cancel_rarity_change(db, creatureId))
