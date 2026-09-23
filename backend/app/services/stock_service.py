import re
from dataclasses import dataclass

from app.integrations.ekt.schemas import ProductDetail, normalize_text


_LOCATION = re.compile(r"(?i)\b(?:в\s+городе|в|на\s+складе|со\s+склада)\s+([а-яёa-z][\w-]*)")
_NON_LOCATIONS = frozenset({"корзину", "корзине", "наличии", "количестве", "каталоге", "городе"})


@dataclass(frozen=True)
class StockSnapshot:
    quantity: int | None
    store_name: str | None = None
    clarification: str | None = None
    scoped: bool = False


def requested_city(text: str, context_city: str | None = None) -> str | None:
    """An explicit city in the message takes precedence over page context."""
    locations = [word for word in _LOCATION.findall(text) if word.casefold() not in _NON_LOCATIONS]
    return locations[-1] if locations else context_city


def get_stock_snapshot(
    detail: ProductDetail | None,
    store_id: int | None = None,
    text: str = "",
    city: str | None = None,
) -> StockSnapshot:
    """Only an explicitly supplied quantity for the selected warehouse is confirmed."""
    mentioned = [word for word in _LOCATION.findall(text) if word.casefold() not in _NON_LOCATIONS]
    if len({normalize_text(word) for word in mentioned}) > 1:
        return StockSnapshot(None, clarification="Уточните один город или склад для проверки остатка.", scoped=True)
    location = requested_city(text, city)
    scoped = store_id is not None or bool(location)
    if detail is None:
        return StockSnapshot(None, scoped=scoped)
    if store_id is not None:
        stores = [store for store in detail.stores if store.id == store_id]
        if location:
            stores = [store for store in stores if normalize_text(store.name) == normalize_text(location)]
    elif location:
        stores = [store for store in detail.stores if normalize_text(store.name) == normalize_text(location)]
    else:
        quantity = detail.quantity if "quantity" in detail.model_fields_set and detail.quantity >= 0 else None
        return StockSnapshot(quantity)
    if len(stores) != 1:
        return StockSnapshot(None, clarification="Остаток в выбранном городе или на складе не подтверждён.", scoped=True)
    store = stores[0]
    quantity = store.quantity if "quantity" in store.model_fields_set and store.quantity >= 0 else None
    return StockSnapshot(quantity, store.name, scoped=True)


class StockService:
    @staticmethod
    def available(detail: ProductDetail, city: str | None = None) -> int:
        if city:
            return detail.stock_in_store(city)
        return max(detail.quantity, 0)
