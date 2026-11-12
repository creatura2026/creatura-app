import uuid

from pydantic import Field

from app.models import Utilisateur
from app.schemas.base import ApiModel
from app.schemas.catalog import CreatureSummaryOut


class PlayerOut(ApiModel):
    id: uuid.UUID
    pseudo: str

    @classmethod
    def of(cls, u: Utilisateur) -> "PlayerOut":
        return cls(id=u.id, pseudo=u.pseudo)


class TradeableCardOut(ApiModel):
    creature: CreatureSummaryOut
    available_quantity: int = Field(ge=1)  # exemplaires possédés - 1 : un exemplaire reste au joueur


class TradeableCardsOut(ApiModel):
    player: PlayerOut
    items: list[TradeableCardOut]
