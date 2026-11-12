import uuid

from pydantic import BaseModel

from app.models import Utilisateur
from app.schemas.catalog import CreatureOut


class PlayerOut(BaseModel):
    id: uuid.UUID
    pseudo: str

    @classmethod
    def of(cls, u: Utilisateur) -> "PlayerOut":
        return cls(id=u.id, pseudo=u.pseudo)


class TradeableCardOut(BaseModel):
    creature: CreatureOut
    quantity: int


class TradeableCardsOut(BaseModel):
    player: PlayerOut
    cards: list[TradeableCardOut]
