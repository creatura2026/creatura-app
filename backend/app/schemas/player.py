import uuid

from pydantic import Field

from app.models import Utilisateur
from app.schemas.base import ApiModel
from app.schemas.catalog import CreatureSummaryOut


# Joueur supprimé (AS-71) : ses échanges terminés restent pour l'autre joueur, sans lien vers lui.
DELETED_PLAYER_ID = uuid.UUID(int=0)
DELETED_PLAYER_PSEUDO = "Joueur supprimé"


class PlayerOut(ApiModel):
    id: uuid.UUID
    pseudo: str

    @classmethod
    def of(cls, u: Utilisateur | None) -> "PlayerOut":
        if u is None:
            return cls(id=DELETED_PLAYER_ID, pseudo=DELETED_PLAYER_PSEUDO)
        return cls(id=u.id, pseudo=u.pseudo_public)


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
