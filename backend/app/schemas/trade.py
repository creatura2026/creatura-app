import enum
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, TypeAdapter

from app.models import Echange, EchangeMessage, Sens, Statut
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

MAX_STACKS = 10  # cartes différentes par tapis
MAX_MESSAGE_LENGTH = 500


class TradeItemIn(ApiInput):
    creature_id: str  # identifiant renvoyé par le catalogue
    quantity: int = Field(ge=1, le=10)


class TradeCreateIn(ApiInput):
    """Ouvre une salle d'échange, tapis vides ; les cartes se posent ensuite dans la salle."""

    recipient_id: uuid.UUID
    wanted_creature_id: str | None = None  # carte cherchée chez l'autre joueur (facultatif)


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
    offered: list[TradeItemOut]  # tapis du proposant
    requested: list[TradeItemOut]  # tapis du destinataire
    proposer_ready: bool
    recipient_ready: bool
    wanted: CreatureSummaryOut | None = None
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
            proposer_ready=e.proposeur_pret,
            recipient_ready=e.destinataire_pret,
            wanted=CreatureSummaryOut.of(e.creature_cherchee) if e.creature_cherchee else None,
            created_at=e.cree_le,
            decided_at=e.decide_le,
            failure_reason=e.motif_echec,
        )


class TradeMessageOut(ApiModel):
    id: uuid.UUID
    author: PlayerOut
    text: str
    sent_at: datetime

    @classmethod
    def of(cls, m: EchangeMessage) -> "TradeMessageOut":
        return cls(id=m.id, author=PlayerOut.of(m.auteur), text=m.texte, sent_at=m.envoye_le)


# ── Salle d'échange (WebSocket) : messages du client ─────────────────────────


class TradeOfferCommand(ApiInput):
    """Remplace le tapis du joueur par cette liste de cartes (liste vide pour tout retirer)."""

    type: Literal["offer"]
    items: list[TradeItemIn] = Field(max_length=MAX_STACKS)


class TradeReadyCommand(ApiInput):
    """Valide l'échange tel qu'il est, ou retire sa validation."""

    type: Literal["ready"]
    ready: bool


class TradeChatCommand(ApiInput):
    type: Literal["chat"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_MESSAGE_LENGTH)]


TradeClientMessage = Annotated[
    TradeOfferCommand | TradeReadyCommand | TradeChatCommand, Field(discriminator="type")
]
client_message = TypeAdapter(TradeClientMessage)
