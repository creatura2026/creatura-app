from fastapi import APIRouter

from app.views import admin, admin_accounts, auth, booster, catalog, collection, gifts, health, players, trades

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, catalog, booster, collection, players, trades, gifts, admin, admin_accounts):
    api_router.include_router(module.router)
