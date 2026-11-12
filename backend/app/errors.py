"""Erreurs métier levées par les contrôleurs, traduites en réponses HTTP dans main.py.

Les contrôleurs ne connaissent pas HTTP : ils lèvent ces erreurs, la couche vue
(FastAPI) les convertit en codes de statut.
"""

from sqlalchemy.exc import IntegrityError


class DomainError(Exception):
    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class BadRequest(DomainError):
    status_code = 400


class Unauthorized(DomainError):
    status_code = 401


class Forbidden(DomainError):
    status_code = 403


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class ServerError(DomainError):
    status_code = 500


# Contraintes nommées du schéma → réponse d'API (tableau de db/README.md).
_CONSTRAINTS: dict[str, DomainError] = {
    "uq_utilisateur_pseudo": Conflict("Ce pseudonyme est déjà utilisé"),
    "uq_utilisateur_identifiant": Conflict("Cet identifiant est déjà utilisé"),
    "ck_collection_quantite": Conflict("Plus assez d'exemplaires pour cet échange"),
    "ck_creature_stock_restant": Conflict("Stock épuisé"),
    "ck_echange_participants": BadRequest("Impossible de proposer un échange à soi-même"),
    "ck_utilisateur_pseudo": BadRequest("Le pseudonyme ne peut pas être vide"),
    "ck_utilisateur_identifiant": BadRequest("L'identifiant ne peut pas être vide"),
    "pk_echange_ligne": BadRequest("Une même créature apparaît deux fois du même côté de l'échange"),
}


def from_integrity_error(exc: IntegrityError) -> DomainError:
    """Traduit une violation de contrainte PostgreSQL grâce au nom de la contrainte."""
    name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None) or ""
    if name in _CONSTRAINTS:
        return _CONSTRAINTS[name]
    if name.startswith("fk_") and name.endswith("_creature"):
        return NotFound("Créature introuvable")
    if name.startswith("fk_"):
        return NotFound("Joueur introuvable")
    # Autre contrainte (valeur hors liste…) : bug côté back.
    return ServerError(f"Contrainte de la base non respectée : {name or 'inconnue'}")
