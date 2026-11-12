"""Socle des schémas d'API : JSON en camelCase et pages de résultats (contrat OpenAPI)."""

from dataclasses import dataclass
from math import ceil
from typing import Callable, Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")
R = TypeVar("R")


class ApiModel(BaseModel):
    """Champs en snake_case côté Python, en camelCase dans le JSON (`created_at` → `createdAt`)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class ApiInput(ApiModel):
    """Corps de requête : un champ inconnu est refusé (`additionalProperties: false`)."""

    model_config = ConfigDict(extra="forbid")


@dataclass
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


@dataclass
class PageResult(Generic[R]):
    """Une page de lignes issues de la base, avant conversion en schéma d'API."""

    rows: list[R]
    total: int
    params: PageParams


class Page(ApiModel, Generic[T]):
    """Pagination du contrat : `page` à partir de 1, `pageSize` de 1 à 100."""

    page: int
    page_size: int
    total_items: int
    total_pages: int
    items: list[T]

    @classmethod
    def of(cls, result: PageResult, convert: Callable, **extra) -> "Page[T]":
        """`extra` : champs propres à une page dérivée (ex. `progress` de la collection)."""
        size = result.params.page_size
        return cls(
            page=result.params.page,
            page_size=size,
            total_items=result.total,
            total_pages=ceil(result.total / size),
            items=[convert(row) for row in result.rows],
            **extra,
        )
