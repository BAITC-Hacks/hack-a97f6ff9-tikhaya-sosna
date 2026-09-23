"""Transport-independent request and response contracts for the assistant."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    locale: str = "ru"
    session_id: str | None = Field(default=None, min_length=1, max_length=128)
    city: str | None = Field(default=None, max_length=120)
    limit: int = Field(default=5, ge=1, le=20)
    product_id: int | None = Field(default=None, strict=True, gt=0)
    quantity: int | None = Field(default=None, strict=True, gt=0)
    store_id: int | None = Field(default=None, strict=True, gt=0)

    @field_validator("message")
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message must contain text")
        return value.strip()


class AssistantProduct(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int = Field(strict=True, gt=0)
    name: str = Field(strict=True, min_length=1)
    price: Decimal | None = Field(ge=0, allow_inf_nan=False)
    quantity: int | None = Field(strict=True, ge=0)
    url: str | None = Field(strict=True)

    @field_serializer("price", when_used="json")
    def serialize_price(self, value: Decimal | None) -> int | float | None:
        if value is None:
            return None
        return int(value) if value == value.to_integral_value() else float(value)


class CartProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_id: str = Field(pattern=r"^ca_[0-9a-f]{32}$")
    product_id: int = Field(strict=True, gt=0)
    product_name: str = Field(strict=True, min_length=1)
    quantity: int = Field(strict=True, gt=0)
    available_quantity: int = Field(strict=True, ge=0)
    status: Literal["pending_confirmation"]

    @model_validator(mode="after")
    def check_available_quantity(self) -> "CartProposal":
        if self.quantity > self.available_quantity:
            raise ValueError("Requested quantity exceeds confirmed stock")
        return self


class StructuredResponse(BaseModel):
    """The complete JSON contract at the model/API boundary."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(strict=True, min_length=1)
    products: list[AssistantProduct]
    cart_proposal: CartProposal | None

    @field_validator("message")
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Response message must contain text")
        return value.strip()


class ProductRecommendation(BaseModel):
    id: int
    name: str
    article: str | None = None
    price: Decimal | None = None
    url: str | None = None
    score: float
    reasons: list[str] = Field(default_factory=list)
    same: list[str] = Field(default_factory=list)
    different: list[str] = Field(default_factory=list)


class SourceReference(BaseModel):
    kind: Literal["product", "document"]
    identifier: str
    url: str | None = None


class ProductDetailResult(BaseModel):
    id: int
    name: str
    article: str | None = None
    description: str | None = None
    price: Decimal | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class AssistantResponse(StructuredResponse):
    """Keep internal diagnostics available without exposing them in JSON."""

    message: str = Field(min_length=1, strict=True, validation_alias=AliasChoices("message", "answer"))
    mode: Literal["catalog", "generated"] = Field(default="catalog", exclude=True)
    alternatives: list[ProductRecommendation] = Field(default_factory=list, exclude=True)
    detail: ProductDetailResult | None = Field(default=None, exclude=True)
    sources: list[SourceReference] = Field(default_factory=list, exclude=True)
    warnings: list[str] = Field(default_factory=list, exclude=True)
    needs_clarification: bool = Field(default=False, exclude=True)

    @property
    def answer(self) -> str:
        """Compatibility accessor for existing Python consumers."""
        return self.message
