from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProductListItem(BaseModel):
    id: int
    name: str
    article: str | None = None
    price: Decimal | None = None
    image: str | None = None
    url: str | None = None
    url_api_detail: str | None = None
    offers: list[Any] = Field(default_factory=list)

    model_config = ConfigDict(extra="allow")


class ProductListResponse(BaseModel):
    page: int
    per_page: int
    count: int
    items: list[ProductListItem]

    model_config = ConfigDict(extra="allow")


class StoreStock(BaseModel):
    id: int
    name: str
    quantity: int = 0

    model_config = ConfigDict(extra="allow")


class ProductDetail(BaseModel):
    id: int
    name: str
    article: str | None = None
    description: str | None = None
    price: Decimal | None = None
    quantity: int = 0
    stores: list[StoreStock] = Field(default_factory=list)
    image: str | None = None
    url: str | None = None
    offers: list[Any] = Field(default_factory=list)
    properties: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")
