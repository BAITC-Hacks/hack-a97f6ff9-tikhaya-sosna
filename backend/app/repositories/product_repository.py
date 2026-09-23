from __future__ import annotations

from typing import Iterable

from app.integrations.ekt.schemas import ProductDetail, ProductListItem


class ProductRepository:
    """In-memory catalog initialized from EKT API response-shaped data."""

    def __init__(self, products: Iterable[ProductListItem] = ()) -> None:
        self._products = {product.id: product for product in products}
        self._details: dict[int, ProductDetail] = {}

    def all(self) -> list[ProductListItem]:
        return list(self._products.values())

    def get(self, product_id: int) -> ProductListItem | None:
        return self._products.get(product_id)

    def get_detail(self, product_id: int) -> ProductDetail | None:
        return self._details.get(product_id)

    def search(self, query: str) -> list[ProductListItem]:
        needle = query.strip().casefold()
        if not needle:
            return []
        return [
            product
            for product in self._products.values()
            if needle in product.name.casefold()
            or needle in (product.article or "").casefold()
            or needle == str(product.id)
        ]
