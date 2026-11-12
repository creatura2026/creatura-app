"""Erreurs de validation de FastAPI/Pydantic → `VALIDATION_ERROR` du contrat, en français.

Chaque champ invalide donne `{field, message}` ; `detail` les résume pour l'affichage.
"""

from app.errors import DomainError

# Type d'erreur Pydantic → message (les valeurs de `ctx` sont insérées).
_MESSAGES = {
    "missing": "champ obligatoire",
    "extra_forbidden": "champ non autorisé",
    "string_type": "doit être un texte",
    "string_too_short": "{min_length} caractère(s) au minimum",
    "string_too_long": "{max_length} caractères au maximum",
    "string_pattern_mismatch": "caractères non autorisés (lettres, chiffres, _ et - uniquement)",
    "int_parsing": "doit être un nombre entier",
    "int_type": "doit être un nombre entier",
    "greater_than_equal": "doit être supérieur ou égal à {ge}",
    "less_than_equal": "doit être inférieur ou égal à {le}",
    "too_short": "{min_length} élément(s) au minimum",
    "too_long": "{max_length} éléments au maximum",
    "enum": "valeur attendue : {expected}",
    "literal_error": "valeur attendue : {expected}",
    "uuid_parsing": "identifiant invalide",
    "uuid_type": "identifiant invalide",
    "bool_parsing": "doit valoir true ou false",
    "date_from_datetime_parsing": "date attendue au format AAAA-MM-JJ",
    "date_parsing": "date attendue au format AAAA-MM-JJ",
    "json_invalid": "JSON invalide",
    "model_attributes_type": "objet JSON attendu",
    "dict_type": "objet JSON attendu",
    "list_type": "liste attendue",
}


def _field(loc: tuple) -> str:
    """("body", "offered", 0, "creatureId") → "offered[0].creatureId"."""
    parts = [p for p in loc if p not in ("body", "query", "path", "header")]
    field = ""
    for part in parts:
        field += f"[{part}]" if isinstance(part, int) else (f".{part}" if field else str(part))
    return field or "body"


def _message(error: dict) -> str:
    if error["type"] == "value_error":  # validateur maison : son message est déjà en français
        return str(error.get("ctx", {}).get("error", error["msg"]))
    template = _MESSAGES.get(error["type"])
    if template is None:
        return error["msg"]
    try:
        return template.format(**error.get("ctx", {}))
    except (KeyError, IndexError):
        return error["msg"]


def validation_problem(errors) -> DomainError:
    items = [{"field": _field(tuple(e["loc"])), "message": _message(e)} for e in errors]
    summary = " ; ".join(f"{i['field']} : {i['message']}" for i in items[:3])
    return DomainError(f"Requête invalide. {summary}.", "VALIDATION_ERROR", errors=items)
