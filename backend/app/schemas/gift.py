"""Schémas du don de carte (contrat OpenAPI : schéma `Gift`, routes `/gifts`)."""

import enum
import uuid
from datetime import datetime

from pydantic import Field

from app.models import Don, Statut
from app.schemas.base import ApiInput, ApiModel
from app.schemas.catalog import CreatureSummaryOut
from app.schemas.player import PlayerOut

MAX_GIFT_QUANTITY = 10  # exemplaires donnés en une fois (comme un tapis d'échange)


class GiftStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REFUSED = "REFUSED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


GIFT_STATUS = {
    Statut.EN_ATTENTE: GiftStatus.PENDING,
    Statut.ACCEPTE: GiftStatus.ACCEPTED,
    Statut.REFUSE: GiftStatus.REFUSED,
    Statut.ANNULE: GiftStatus.CANCELLED,
    Statut.ECHOUE: GiftStatus.FAILED,
}
STATUT_OF = {status: statut for statut, status in GIFT_STATUS.items()}


class GiftRole(str, enum.Enum):
    all = "all"
    sent = "sent"
    received = "received"


class GiftCreateIn(ApiInput):
    """Offre `quantity` copies d'une carte possédée à un autre joueur, à accepter ou refuser."""

    recipient_id: uuid.UUID
    creature_id: str  # identifiant renvoyé par le catalogue
    quantity: int = Field(default=1, ge=1, le=MAX_GIFT_QUANTITY)


class GiftOut(ApiModel):
    id: uuid.UUID
    status: GiftStatus
    giver: PlayerOut
    recipient: PlayerOut
    creature: CreatureSummaryOut
    quantity: int
    created_at: datetime
    decided_at: datetime | None
    failure_reason: str | None = None

    @classmethod
    def of(cls, d: Don) -> "GiftOut":
        return cls(
            id=d.id,
            status=GIFT_STATUS[d.statut],
            giver=PlayerOut.of(d.donneur),
            recipient=PlayerOut.of(d.destinataire),
            creature=CreatureSummaryOut.of(d.creature),
            quantity=d.quantite,
            created_at=d.cree_le,
            decided_at=d.decide_le,
            failure_reason=d.motif_echec,
        )
