"""Joueurs, demandes de suppression et comptes admin dans le dashboard (AS-71)."""

import datetime as dt
import enum
import uuid

from pydantic import Field, field_validator

from app.models import DemandeSuppression, StatutDemande
from app.schemas.admin import DailyCount, Period
from app.schemas.auth import Login, Pseudo, _fits_bcrypt
from app.schemas.base import ApiInput, ApiModel, Page
from app.schemas.catalog import FamilyOut, RaritySummaryOut
from app.schemas.player import PlayerOut

REQUEST_LIFETIME = dt.timedelta(days=7)  # une demande non traitée expire (fonction SQL)
MAX_PLAYERS_PER_REQUEST = 100


# ── Joueurs ──────────────────────────────────────────────────────────────────


class PlayerSort(str, enum.Enum):
    PSEUDO = "pseudo"
    CREATED_AT = "createdAt"
    LAST_LOGIN_AT = "lastLoginAt"
    LOGINS = "logins"
    TOTAL_CARDS = "totalCards"


class SortOrder(str, enum.Enum):
    ASC = "asc"
    DESC = "desc"


class Granularity(str, enum.Enum):
    DAY = "DAY"
    MONTH = "MONTH"


class AdminPlayerOut(ApiModel):
    id: uuid.UUID
    pseudo: str
    login: str
    created_at: dt.datetime
    last_login_at: dt.datetime | None  # null : jamais connecté (ou plus depuis 13 mois)
    logins_in_period: int
    total_cards: int  # exemplaires, doublons compris
    pending_deletion_request_id: uuid.UUID | None  # demande de suppression en attente


class AdminPlayerPage(Page[AdminPlayerOut]):
    period: Period  # période des connexions comptées (logins_in_period)


class RarityCount(ApiModel):
    rarity: RaritySummaryOut
    cards: int  # exemplaires, doublons compris
    distinct_creatures: int


class FamilyCount(ApiModel):
    family: FamilyOut
    cards: int
    distinct_creatures: int


class LoginHistory(ApiModel):
    granularity: Granularity
    # Un point par jour (DAY) ou par mois (MONTH, date du 1er du mois) de la période, 0 compris
    points: list[DailyCount]


class AdminPlayerDetailOut(ApiModel):
    player: AdminPlayerOut
    cards_by_rarity: list[RarityCount]
    cards_by_family: list[FamilyCount]
    logins: LoginHistory


# ── Demandes de suppression ──────────────────────────────────────────────────


class DeletionRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


REQUEST_STATUS = {
    StatutDemande.EN_ATTENTE: DeletionRequestStatus.PENDING,
    StatutDemande.VALIDEE: DeletionRequestStatus.APPROVED,
    StatutDemande.REFUSEE: DeletionRequestStatus.REJECTED,
    StatutDemande.ANNULEE: DeletionRequestStatus.CANCELLED,
    StatutDemande.EXPIREE: DeletionRequestStatus.EXPIRED,
}
STATUT_DEMANDE_OF = {code: statut for statut, code in REQUEST_STATUS.items()}


class AdminSummaryOut(ApiModel):
    id: uuid.UUID
    pseudo: str


class DeletionRequestOut(ApiModel):
    id: uuid.UUID
    status: DeletionRequestStatus
    requested_by: AdminSummaryOut
    validator: AdminSummaryOut
    reason: str | None
    account_count: int
    players: list[PlayerOut]  # vide une fois les joueurs supprimés : le journal ne les garde pas
    created_at: dt.datetime
    expires_at: dt.datetime
    decided_at: dt.datetime | None

    @classmethod
    def of(cls, d: DemandeSuppression) -> "DeletionRequestOut":
        return cls(
            id=d.id,
            status=REQUEST_STATUS[d.statut],
            requested_by=AdminSummaryOut(id=d.demandeur.id, pseudo=d.demandeur.pseudo),
            validator=AdminSummaryOut(id=d.valideur.id, pseudo=d.valideur.pseudo),
            reason=d.motif,
            account_count=d.nombre_comptes,
            players=sorted((PlayerOut.of(j.joueur) for j in d.joueurs), key=lambda p: p.pseudo.lower()),
            created_at=d.cree_le,
            expires_at=d.cree_le + REQUEST_LIFETIME,
            decided_at=d.traite_le,
        )


class DeletionRequestIn(ApiInput):
    player_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_PLAYERS_PER_REQUEST)
    validator_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=500)


# ── Comptes admin ────────────────────────────────────────────────────────────


class AdminAccountOut(ApiModel):
    id: uuid.UUID
    pseudo: str
    login: str
    created_at: dt.datetime
    created_by: AdminSummaryOut | None  # null : premier admin, créé au démarrage du back
    last_login_at: dt.datetime | None
    must_change_password: bool  # mot de passe provisoire pas encore remplacé
    active: bool
    deactivated_at: dt.datetime | None
    deactivated_by: AdminSummaryOut | None


class AdminAccountIn(ApiInput):
    pseudo: Pseudo
    login: Login
    # Mot de passe provisoire, à remplacer par le nouvel admin à sa première connexion
    temporary_password: str = Field(min_length=12, max_length=128)

    @field_validator("temporary_password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        return _fits_bcrypt(value)
