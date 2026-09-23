"""Compare verified structured catalog facts before suggesting alternatives."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Mapping

from app.integrations.ekt.schemas import ProductDetail, ProductListItem
from app.search.ranking import AlternativeFactors, alternative_sort_key
from app.services.stock_service import StockSnapshot


_WORD = re.compile(r"\w+", re.UNICODE)


@dataclass(frozen=True)
class Alternative:
    product: ProductListItem
    score: float
    reason: str
    same: tuple[str, ...] = ()
    different: tuple[str, ...] = ()
    category_match: bool | None = None
    available_quantity: int | None = None
    store_name: str | None = None
    stock_scoped: bool = False


_CATEGORY_ID = ("category_id",)
_CATEGORY_NAME = ("category", "категория")
_BRAND = ("brand", "бренд")
_METADATA_KEYS = frozenset((*_CATEGORY_ID, *_CATEGORY_NAME, *_BRAND))


def _scalar(value: object) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        return None
    text = str(value).strip()
    return text if text else None


def _metadata(product: ProductListItem, detail: ProductDetail | None, keys: tuple[str, ...]) -> str | None:
    """Read only explicitly labelled scalar fields, never infer them from names."""
    for source in (detail.properties if detail else {}, (detail.model_extra or {}) if detail else {}, product.model_extra or {}):
        values = [_scalar(value) for key, value in source.items() if key.strip().casefold() in keys]
        values = [value for value in values if value is not None]
        if values:
            return values[0] if len({value.casefold() for value in values}) == 1 else None
    return None


def _category_match(
    source: ProductListItem,
    candidate: ProductListItem,
    source_detail: ProductDetail | None,
    candidate_detail: ProductDetail | None,
) -> bool | None:
    for keys in (_CATEGORY_ID, _CATEGORY_NAME):
        source_value = _metadata(source, source_detail, keys)
        candidate_value = _metadata(candidate, candidate_detail, keys)
        if source_value is not None and candidate_value is not None:
            return source_value.casefold() == candidate_value.casefold()
    return None


def _properties(detail: ProductDetail | None) -> dict[str, tuple[str, str]]:
    if detail is None:
        return {}
    result: dict[str, tuple[str, str]] = {}
    ambiguous: set[str] = set()
    for label, value in detail.properties.items():
        key = label.strip().casefold()
        normalized = _scalar(value)
        if key and key not in _METADATA_KEYS and normalized is not None:
            if key in result and result[key][1].casefold() != normalized.casefold():
                ambiguous.add(key)
            elif key not in ambiguous:
                result[key] = (label.strip(), normalized)
    for key in ambiguous:
        result.pop(key, None)
    return result


def _comparison(
    source: ProductListItem,
    candidate: ProductListItem,
    source_detail: ProductDetail | None,
    candidate_detail: ProductDetail | None,
    category_match: bool | None,
) -> tuple[tuple[str, ...], tuple[str, ...], int, int, bool | None]:
    same: list[str] = []
    different: list[str] = []
    if category_match is True:
        label = _metadata(source, source_detail, _CATEGORY_NAME)
        candidate_label = _metadata(candidate, candidate_detail, _CATEGORY_NAME)
        if label and candidate_label and label.casefold() == candidate_label.casefold():
            same.append(f"Категория: {label}")
        else:
            identifier = _metadata(source, source_detail, _CATEGORY_ID)
            if identifier:
                same.append(f"Совпадает категория (ID: {identifier})")

    source_properties = _properties(source_detail)
    candidate_properties = _properties(candidate_detail)
    matched = 0
    differed = 0
    for key in sorted(source_properties.keys() & candidate_properties.keys()):
        label, source_value = source_properties[key]
        candidate_value = candidate_properties[key][1]
        if source_value.casefold() == candidate_value.casefold():
            same.append(f"{label}: {source_value}")
            matched += 1
        else:
            different.append(f"{label}: {candidate_value} вместо {source_value}")
            differed += 1

    source_brand = _metadata(source, source_detail, _BRAND)
    candidate_brand = _metadata(candidate, candidate_detail, _BRAND)
    brand_match: bool | None = None
    if source_brand is not None and candidate_brand is not None:
        brand_match = source_brand.casefold() == candidate_brand.casefold()
        if brand_match:
            same.append(f"Бренд: {source_brand}")
        else:
            different.append(f"Бренд: {candidate_brand} вместо {source_brand}")
    return tuple(same), tuple(different), matched, differed, brand_match


def find_alternatives(
    source: ProductListItem,
    candidates: Iterable[ProductListItem],
    limit: int = 5,
    *,
    source_detail: ProductDetail | None = None,
    candidate_details: Mapping[int, ProductDetail | None] | None = None,
    stocks: Mapping[int, StockSnapshot] | None = None,
) -> list[Alternative]:
    """Exclude known category mismatches and rank only observable comparisons."""
    if limit < 0:
        raise ValueError("Limit cannot be negative")

    source_terms = set(token.casefold() for token in _WORD.findall(source.name))
    ranked: list[tuple[tuple, Alternative]] = []
    seen: set[int] = {source.id}
    for candidate in candidates:
        if candidate.id in seen:
            continue
        seen.add(candidate.id)
        candidate_detail = (candidate_details or {}).get(candidate.id)
        if candidate_detail is not None and candidate_detail.id != candidate.id:
            continue
        category_match = _category_match(source, candidate, source_detail, candidate_detail)
        if category_match is False:
            continue
        candidate_terms = set(token.casefold() for token in _WORD.findall(candidate.name))
        common = source_terms & candidate_terms
        same, different, matched, differed, brand_match = _comparison(
            source, candidate, source_detail, candidate_detail, category_match,
        )
        if not common and not same and not different:
            continue
        similarity = matched / (matched + differed) if matched + differed else len(common) / max(1, len(source_terms | candidate_terms))
        stock = (stocks or {}).get(candidate.id, StockSnapshot(None))
        source_price = source_detail.price if source_detail and source_detail.price is not None else source.price
        candidate_price = candidate_detail.price if candidate_detail and candidate_detail.price is not None else candidate.price
        price_difference = abs(candidate_price - source_price) if source_price is not None and candidate_price is not None else None
        factors = AlternativeFactors(
            category_match, matched, differed, stock.quantity, stock.scoped,
            price_difference, brand_match, candidate.id,
        )
        alternative = Alternative(
            candidate, similarity, "Сравнение по подтверждённым данным; совместимость не подтверждена",
            same, different, category_match, stock.quantity, stock.store_name, stock.scoped,
        )
        ranked.append((alternative_sort_key(factors), alternative))

    ranked.sort(key=lambda item: item[0])
    return [item for _, item in ranked[:limit]]
