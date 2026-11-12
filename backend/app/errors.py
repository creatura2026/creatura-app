"""Erreurs métier levées par les contrôleurs, traduites en réponses HTTP dans main.py.

Les contrôleurs ne connaissent pas HTTP : ils lèvent ces erreurs avec un `code` stable du
contrat (creatura-api.openapi.yaml, schéma `ErrorCode`). La couche vue les renvoie au format
Problem Details (RFC 9457) : `type`, `title`, `status`, `code`, `detail`, et `errors` pour
les erreurs de validation.
"""

from sqlalchemy.exc import IntegrityError

# code → (statut HTTP, titre identique pour toutes les erreurs de ce type)
ERROR_CODES: dict[str, tuple[int, str]] = {
    "VALIDATION_ERROR": (400, "Requête invalide"),
    "INVALID_CREDENTIALS": (401, "Identifiants incorrects"),
    "UNAUTHENTICATED": (401, "Authentification requise"),
    "FORBIDDEN": (403, "Accès refusé"),
    "NOT_FOUND": (404, "Ressource introuvable"),
    "LOGIN_ALREADY_USED": (409, "Identifiant déjà utilisé"),
    "PSEUDO_ALREADY_USED": (409, "Pseudonyme déjà utilisé"),
    "BOOSTER_ALREADY_CLAIMED": (409, "Booster déjà réclamé"),
    "TRADE_NOT_PENDING": (409, "Échange clos"),
    "CARDS_UNAVAILABLE": (409, "Cartes indisponibles"),
    "CARDS_NOT_OWNED": (422, "Cartes non possédées"),
    "TRADE_WITH_SELF": (422, "Échange avec soi-même"),
    "RATE_LIMITED": (429, "Trop de tentatives"),
    "INTERNAL_ERROR": (500, "Erreur interne"),
}


PROBLEM_TYPE = "https://app.creatura.fr/problems/"


def problem_body(error: "DomainError") -> dict:
    """Corps Problem Details (RFC 9457) avec le code stable du contrat ; HTTP et salle d'échange."""
    body = {
        "type": PROBLEM_TYPE + error.code.lower().replace("_", "-"),
        "title": error.title,
        "status": error.status_code,
        "code": error.code,
        "detail": error.detail,
    }
    if error.errors:
        body["errors"] = error.errors
    return body


class DomainError(Exception):
    """Erreur métier : un code du contrat et un message affichable à l'utilisateur."""

    default_code = "VALIDATION_ERROR"

    def __init__(self, detail: str, code: str | None = None, errors: list[dict] | None = None):
        super().__init__(detail)
        self.detail = detail
        self.code = code or self.default_code
        self.errors = errors  # [{field, message}] : champs en cause

    @property
    def status_code(self) -> int:
        return ERROR_CODES[self.code][0]

    @property
    def title(self) -> str:
        return ERROR_CODES[self.code][1]


class BadRequest(DomainError):
    default_code = "VALIDATION_ERROR"


class Unauthorized(DomainError):
    default_code = "UNAUTHENTICATED"


class Forbidden(DomainError):
    default_code = "FORBIDDEN"


class NotFound(DomainError):
    default_code = "NOT_FOUND"


class Conflict(DomainError):
    """409 : à préciser avec un code (BOOSTER_ALREADY_CLAIMED, TRADE_NOT_PENDING…)."""

    default_code = "CARDS_UNAVAILABLE"


class ServerError(DomainError):
    default_code = "INTERNAL_ERROR"


def field_error(code: str, field: str, message: str) -> DomainError:
    """Erreur portant sur un champ du formulaire (affichable sous le champ par le client)."""
    return DomainError(message, code, errors=[{"field": field, "message": message}])


# Contraintes nommées du schéma → erreur d'API (tableau de db/README.md).
_CONSTRAINTS: dict[str, DomainError] = {
    "uq_utilisateur_pseudo": field_error("PSEUDO_ALREADY_USED", "pseudo", "Ce pseudonyme est déjà pris."),
    "uq_utilisateur_identifiant": field_error("LOGIN_ALREADY_USED", "login", "Cet identifiant est déjà utilisé."),
    "ck_collection_quantite": Conflict("Une carte n'est plus disponible. Aucune carte n'a été transférée."),
    "ck_creature_stock_restant": Conflict("Stock épuisé : réessayez."),
    "ck_echange_participants": DomainError("Vous ne pouvez pas échanger avec vous-même.", "TRADE_WITH_SELF"),
    "ck_utilisateur_pseudo": field_error("VALIDATION_ERROR", "pseudo", "Le pseudonyme ne peut pas être vide."),
    "ck_utilisateur_identifiant": field_error("VALIDATION_ERROR", "login", "L'identifiant ne peut pas être vide."),
    "pk_echange_ligne": BadRequest("Une même créature apparaît deux fois du même côté de l'échange."),
    "ck_reglage_cartes_par_booster": field_error(
        "VALIDATION_ERROR", "cardsPerBooster", "Un booster contient de 1 à 10 cartes."
    ),
}


def from_integrity_error(exc: IntegrityError) -> DomainError:
    """Traduit une violation de contrainte PostgreSQL grâce au nom de la contrainte."""
    name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None) or ""
    if name in _CONSTRAINTS:
        return _CONSTRAINTS[name]
    if name.startswith("fk_") and name.endswith("_creature"):
        return NotFound("Cette créature n'existe pas.")
    if name.startswith("fk_"):
        return NotFound("Ce joueur n'existe pas.")
    # Autre contrainte (valeur hors liste…) : bug côté back.
    return ServerError(f"Contrainte de la base non respectée : {name or 'inconnue'}")
