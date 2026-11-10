"""Erreurs métier levées par les contrôleurs, traduites en réponses HTTP dans main.py.

Les contrôleurs ne connaissent pas HTTP : ils lèvent ces erreurs, la couche vue
(FastAPI) les convertit en codes de statut.
"""


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
