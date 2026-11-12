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
    available_quantity: int = Field(ge=1)  # exemplaires possédés : tous peuvent être échangés


class TradeableCardsOut(ApiModel):
    player: PlayerOut
    items: list[TradeableCardOut]


class CreatureOwnerOut(ApiModel):
    player: PlayerOut
    quantity: int = Field(ge=1)


class CreatureOwnersOut(ApiModel):
    creature: CreatureSummaryOut
    items: list[CreatureOwnerOut]
