from pydantic import BaseModel

from app.models import Creature, Famille, Rarete

FAMILY_LABELS = {
    Famille.NATURE: "Nature",
    Famille.CRISTAL: "Cristal",
    Famille.BRUME: "Brume",
    Famille.LUEUR: "Lueur",
}

RARITY_LABELS = {
    Rarete.COMMUN: "Commun",
    Rarete.PEU_COMMUN: "Peu commun",
    Rarete.RARE: "Rare",
}

RARITY_RANK = {Rarete.COMMUN: 1, Rarete.PEU_COMMUN: 2, Rarete.RARE: 3}


class FamilyOut(BaseModel):
    code: Famille
    label: str


class RarityOut(BaseModel):
    code: Rarete
    label: str
    rank: int  # 1 = la plus commune
    drop_rate_percent: float  # probabilité actuelle qu'une carte tirée soit de cette rareté


class CreatureOut(BaseModel):
    id: int
    name: str
    description: str | None
    family: Famille
    rarity: Rarete
    image: str  # chemin relatif, le front ajoute l'URL du CDN
    stock_total: int
    stock_remaining: int

    @classmethod
    def of(cls, c: Creature) -> "CreatureOut":
        return cls(
            id=c.id,
            name=c.nom,
            description=c.description,
            family=c.famille,
            rarity=c.rarete,
            image=c.image,
            stock_total=c.stock_total,
            stock_remaining=c.stock_restant,
        )
