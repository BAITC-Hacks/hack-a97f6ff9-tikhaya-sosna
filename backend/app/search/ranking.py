"""Deterministic ordering of catalog matches with explainable reasons."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from app.integrations.ekt.schemas import ProductListItem
from app.search.query_parser import SearchQuery


@dataclass(frozen=True)
class RankedProduct:
    product: ProductListItem
    score: int
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class AlternativeFactors:
    category_match: bool | None
    matching_properties: int
    differing_properties: int
    available_quantity: int | None
    stock_scoped: bool
    price_difference: Decimal | None
    same_brand: bool | None
    product_id: int


def alternative_sort_key(factors: AlternativeFactors) -> tuple:
    """Order confirmed category, properties, city stock, price, then brand."""
    category_rank = 0 if factors.category_match is True else 1
    if not factors.stock_scoped:
        stock_rank = 0
    elif factors.available_quantity is None:
        stock_rank = 1
    elif factors.available_quantity > 0:
        stock_rank = 0
    else:
        stock_rank = 2
    brand_rank = 0 if factors.same_brand is True else 1 if factors.same_brand is None else 2
    return (
        category_rank,
        -factors.matching_properties,
        factors.differing_properties,
        stock_rank,
        factors.price_difference is None,
        factors.price_difference if factors.price_difference is not None else Decimal(0),
        brand_rank,
        factors.product_id,
    )


def rank_products(query: SearchQuery, candidates: Iterable[ProductListItem], limit: int = 10) -> list[RankedProduct]:
    """Rank observable matches without inferring missing product properties."""
    if limit < 0:
        raise ValueError("Limit cannot be negative")

    ranked: list[RankedProduct] = []
    seen: set[int] = set()
    for product in candidates:
        if product.id in seen:
            continue
        seen.add(product.id)
        if query.max_price is not None and (product.price is None or product.price > query.max_price):
            continue

        score = 0
        reasons: list[str] = []
        name = product.name.casefold()
        article = (product.article or "").casefold()

        if query.product_id == product.id:
            score += 100
            reasons.append("совпадение по ID")
        if query.article and query.article.casefold() == article:
            score += 80
            reasons.append("точное совпадение артикула")
        if query.search_text and query.search_text == name:
            score += 60
            reasons.append("точное совпадение названия")

        matching_terms = [term for term in query.terms if term in name or term in article]
        if matching_terms:
            score += 10 * len(matching_terms)
            reasons.append(f"совпало терминов: {len(matching_terms)}")

        if score:
            ranked.append(RankedProduct(product, score, tuple(reasons)))

    ranked.sort(key=lambda item: (-item.score, item.product.id))
    return ranked[:limit]
