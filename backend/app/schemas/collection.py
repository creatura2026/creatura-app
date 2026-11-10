import enum

from pydantic import BaseModel

from app.schemas.auth import CollectionSummary
from app.schemas.catalog import CreatureOut


class CollectionFilter(str, enum.Enum):
    all = "all"
    owned = "owned"
    missing = "missing"
    duplicates = "duplicates"


class CollectionItemOut(BaseModel):
    creature: CreatureOut
    quantity: int  # 0 = carte manquante


class CollectionOut(BaseModel):
    summary: CollectionSummary
    items: list[CollectionItemOut]
