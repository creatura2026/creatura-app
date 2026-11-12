import enum
import uuid
from datetime import datetime

from pydantic import Field

from app.models import Echange, Sens, Statut
from app.schemas.base import ApiInput, ApiModel
from app.schemas.catalog import CreatureSummaryOut
from app.schemas.player import PlayerOut


class TradeStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REFUSED = "REFUSED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


TRADE_STATUS = {
    Statut.EN_ATTENTE: TradeStatus.PENDING,
    Statut.ACCEPTE: TradeStatus.ACCEPTED,
    Statut.REFUSE: TradeStatus.REFUSED,
    Statut.ANNULE: TradeStatus.CANCELLED,
    Statut.ECHOUE: TradeStatus.FAILED,
}
STATUT_OF = {status: statut for statut, status in TRADE_STATUS.items()}


class TradeItemIn(ApiInput):
    creature_id: str  # identifiant renvoyé par le catalogue
    quantity: int = Field(ge=1, le=10)


class TradeCreateIn(ApiInput):
    """Échange n ↔ n : au moins une carte de chaque côté (1 contre 1 au minimum)."""

    recipient_id: uuid.UUID
    offered: list[TradeItemIn] = Field(min_length=1, max_length=10)  # cartes que je donne
    requested: list[TradeItemIn] = Field(min_length=1, max_length=10)  # cartes que je demande


class TradeRole(str, enum.Enum):
    all = "all"
    sent = "sent"
    received = "received"


class TradeItemOut(ApiModel):
    creature: CreatureSummaryOut
    quantity: int


class TradeOut(ApiModel):
    id: uuid.UUID
    status: TradeStatus
    proposer: PlayerOut
    recipient: PlayerOut
    offered: list[TradeItemOut]  # données par le proposant
    requested: list[TradeItemOut]  # données par le destinataire
    created_at: datetime
    decided_at: datetime | None
    failure_reason: str | None = None

    @classmethod
    def of(cls, e: Echange) -> "TradeOut":
        def items(sens: Sens) -> list[TradeItemOut]:
            return [
                TradeItemOut(creature=CreatureSummaryOut.of(l.creature), quantity=l.quantite)
                for l in e.lignes
                if l.sens == sens
            ]

        return cls(
            id=e.id,
            status=TRADE_STATUS[e.statut],
            proposer=PlayerOut.of(e.proposeur),
            recipient=PlayerOut.of(e.destinataire),
            offered=items(Sens.OFFERT),
            requested=items(Sens.DEMANDE),
            created_at=e.cree_le,
            decided_at=e.decide_le,
            failure_reason=e.motif_echec,
        )
