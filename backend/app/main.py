from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.errors import DomainError, from_integrity_error
from app.seed import ensure_admin
from app.views import api_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Le schéma est créé par les fichiers SQL de db/ : le back ne crée aucune table.
    ensure_admin()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CREATURA API",
        version="0.2.0",
        description="Collection et échange de cartes de créatures.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=headers)

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        # Filet de sécurité : une contrainte de la base a refusé l'écriture.
        return await domain_error_handler(request, from_integrity_error(exc))

    app.include_router(api_router)
    return app


app = create_app()
