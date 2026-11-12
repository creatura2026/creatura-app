from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.errors import DomainError, from_integrity_error, problem_body
from app.seed import ensure_admin
from app.validation import validation_problem
from app.views import api_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Le schéma est créé par les fichiers SQL de db/ : le back ne crée aucune table.
    ensure_admin()
    yield


def problem_response(error: DomainError) -> JSONResponse:
    """Réponse au format Problem Details (RFC 9457), avec le code stable du contrat."""
    headers = {"WWW-Authenticate": "Bearer"} if error.status_code == 401 else None
    return JSONResponse(
        problem_body(error), status_code=error.status_code, headers=headers, media_type="application/problem+json"
    )


# Erreurs HTTP levées par FastAPI lui-même (route inconnue, méthode non permise…).
_HTTP_CODES = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND"}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CREATURA API",
        version="1.0.0",
        description="Collection et échange de cartes de créatures. Contrat : creatura-api.openapi.yaml.",
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
        return problem_response(exc)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError):
        # Le contrat renvoie 400 VALIDATION_ERROR (et non le 422 par défaut de FastAPI).
        return problem_response(validation_problem(exc.errors()))

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(_: Request, exc: IntegrityError):
        # Filet de sécurité : une contrainte de la base a refusé l'écriture.
        return problem_response(from_integrity_error(exc))

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code)
        if code is None:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)
        detail = "Cette adresse n'existe pas." if exc.status_code == 404 else str(exc.detail)
        return problem_response(DomainError(detail, code))

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_: Request, exc: Exception):
        return problem_response(DomainError("Une erreur inattendue est survenue.", "INTERNAL_ERROR"))

    app.include_router(api_router)
    return app


app = create_app()
