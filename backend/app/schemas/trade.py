import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import Echange, Sens, Statut
from app.schemas.catalog import CreatureOut
from app.schemas.player import PlayerOut


class TradeLineIn(BaseModel):
    creature_id: int
    quantity: int = Field(1, gt=0, le=100)


class TradeCreateIn(BaseModel):
    """Échange n ↔ n : au moins une carte de chaque côté (1 contre 1 au minimum)."""

    recipient_id: uuid.UUID
    offered: list[TradeLineIn] = Field(min_length=1, max_length=10)  # cartes que je donne
    requested: list[TradeLineIn] = Field(min_length=1, max_length=10)  # cartes que je demande


class TradeRole(str, enum.Enum):
    all = "all"
    sent = "sent"
    received = "received"


class TradeLineOut(BaseModel):
    creature: CreatureOut
    quantity: int


class TradeOut(BaseModel):
    id: uuid.UUID
    status: Statut
    proposer: PlayerOut
    recipient: PlayerOut
    offered: list[TradeLineOut]  # données par le proposeur
    requested: list[TradeLineOut]  # données par le destinataire
    created_at: datetime
    decided_at: datetime | None

    @classmethod
    def of(cls, e: Echange) -> "TradeOut":
        def lines(sens: Sens) -> list[TradeLineOut]:
            return [
                TradeLineOut(creature=CreatureOut.of(l.creature), quantity=l.quantite)
                for l in e.lignes
                if l.sens == sens
            ]

        return cls(
            id=e.id,
            status=e.statut,
            proposer=PlayerOut.of(e.proposeur),
            recipient=PlayerOut.of(e.destinataire),
            offered=lines(Sens.OFFERT),
            requested=lines(Sens.DEMANDE),
            created_at=e.cree_le,
            decided_at=e.decide_le,
        )
