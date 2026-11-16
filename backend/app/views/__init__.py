from fastapi import APIRouter

from app.views import admin, auth, booster, catalog, collection, health, players, trades

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, catalog, booster, collection, players, trades, admin):
    api_router.include_router(module.router)
