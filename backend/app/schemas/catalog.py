"""Catalogue : créatures, familles, raretés.

La base garde ses codes français (COMMUN, PEU_COMMUN…) ; l'API expose ceux du contrat
(COMMON, UNCOMMON…). Les familles ont le même code des deux côtés.
"""

import enum

from app.config import get_settings
from app.models import Creature, Famille, Rarete
from app.schemas.base import ApiModel

FAMILY_LABELS = {
    Famille.NATURE: "Nature",
    Famille.CRISTAL: "Cristal",
    Famille.BRUME: "Brume",
    Famille.LUEUR: "Lueur",
}


class RarityCode(str, enum.Enum):
    COMMON = "COMMON"
    UNCOMMON = "UNCOMMON"
    RARE = "RARE"
    LEGENDARY = "LEGENDARY"


RARITY_CODES = {
    Rarete.COMMUN: RarityCode.COMMON,
    Rarete.PEU_COMMUN: RarityCode.UNCOMMON,
    Rarete.RARE: RarityCode.RARE,
    Rarete.LEGENDAIRE: RarityCode.LEGENDARY,
}
RARETE_OF = {code: rarete for rarete, code in RARITY_CODES.items()}
RARITY_LABELS = {
    Rarete.COMMUN: "Commun",
    Rarete.PEU_COMMUN: "Peu commun",
    Rarete.RARE: "Rare",
    Rarete.LEGENDAIRE: "Légendaire",
}
RARITY_RANK = {Rarete.COMMUN: 1, Rarete.PEU_COMMUN: 2, Rarete.RARE: 3, Rarete.LEGENDAIRE: 4}


def image_url(path: str) -> str:
    """Clé du fichier dans le bucket (sprites/moss_puff.png) → URL du CDN."""
    return f"{get_settings().image_base_url.rstrip('/')}/{path.lstrip('/')}"


class FamilyOut(ApiModel):
    code: Famille
    label: str

    @classmethod
    def of(cls, famille: Famille) -> "FamilyOut":
        return cls(code=famille, label=FAMILY_LABELS[famille])


class RaritySummaryOut(ApiModel):
    code: RarityCode
    label: str

    @classmethod
    def of(cls, rarete: Rarete) -> "RaritySummaryOut":
        return cls(code=RARITY_CODES[rarete], label=RARITY_LABELS[rarete])


class RarityOut(RaritySummaryOut):
    rank: int  # 1 = la plus commune
    drop_rate: float  # probabilité (0 à 1) qu'une carte tirée soit de cette rareté


class CreatureSummaryOut(ApiModel):
    # La base numérote les créatures (entier) : l'API les expose en texte, comme les autres identifiants.
    id: str
    name: str
    family: FamilyOut
    rarity: RaritySummaryOut
    image_url: str

    @classmethod
    def of(cls, c: Creature) -> "CreatureSummaryOut":
        return cls(**cls._fields(c))

    @staticmethod
    def _fields(c: Creature) -> dict:
        return {
            "id": str(c.id),
            "name": c.nom,
            "family": FamilyOut.of(c.famille),
            "rarity": RaritySummaryOut.of(c.rarete),
            "image_url": image_url(c.image),
        }


class CreatureOut(CreatureSummaryOut):
    description: str

    @classmethod
    def of(cls, c: Creature) -> "CreatureOut":
        return cls(**cls._fields(c), description=c.description or "")
