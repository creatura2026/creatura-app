import enum

from app.schemas.auth import CollectionProgress
from app.schemas.base import ApiModel, Page
from app.schemas.catalog import CreatureSummaryOut


class Ownership(str, enum.Enum):
    all = "all"
    owned = "owned"
    missing = "missing"


class CollectionEntryOut(ApiModel):
    creature: CreatureSummaryOut
    quantity: int  # 0 = carte manquante


class CollectionPageOut(Page[CollectionEntryOut]):
    progress: CollectionProgress
