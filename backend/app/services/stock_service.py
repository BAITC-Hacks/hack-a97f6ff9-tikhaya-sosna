"""Read confirmed aggregate or store stock from catalog details."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.integrations.ekt.schemas import ProductDetail


_LOCATION = re.compile(r"(?i)\b(?:в|на\s+складе|со\s+склада)\s+([а-яёa-z][\w-]*)")
_NON_LOCATIONS = frozenset({"корзину", "корзине", "наличии", "количестве", "каталоге"})


@dataclass(frozen=True)
class StockSnapshot:
    quantity: int | None
    store_name: str | None = None
    clarification: str | None = None
    scoped: bool = False


def get_stock_snapshot(detail: ProductDetail | None, store_id: int | None = None, text: str = "") -> StockSnapshot:
    """Never interpret a defaulted zero as a confirmed stock value."""
    locations = [word.casefold() for word in _LOCATION.findall(text) if word.casefold() not in _NON_LOCATIONS]
    scoped = store_id is not None or bool(locations)
    if detail is None:
        return StockSnapshot(None, scoped=scoped)

    stores = detail.stores
    if store_id is not None:
        stores = [store for store in stores if store.id == store_id]
        if locations and not all(any(location in store.name.casefold().split() for store in stores) for location in locations):
            return StockSnapshot(None, clarification="Уточните склад: выбранный склад и место в запросе различаются.", scoped=True)
    elif locations:
        stores = [store for store in stores if all(location in store.name.casefold().split() for location in locations)]
    else:
        quantity = detail.quantity if "quantity" in detail.model_fields_set and detail.quantity >= 0 else None
        return StockSnapshot(quantity)

    if len(stores) != 1:
        return StockSnapshot(None, clarification="Уточните склад: остаток для указанного места не подтверждён.", scoped=True)
    store = stores[0]
    quantity = store.quantity if "quantity" in store.model_fields_set and store.quantity >= 0 else None
    return StockSnapshot(quantity, store.name, scoped=True)
