"""Restricted catalog and document operations available to the orchestrator."""

from __future__ import annotations

from pathlib import PurePath
from typing import Any

from app.documents import ParsedDocument
from app.documents.excel_parser import parse_excel
from app.documents.image_parser import ImageExtractor, parse_image
from app.documents.pdf_parser import PdfExtractor, parse_pdf
from app.documents.word_parser import parse_word
from app.integrations.ekt.schemas import ProductDetail, ProductListItem
from app.integrations.ekt.mapper import detail_to_list_item
from app.search.alternatives import Alternative, find_alternatives
from app.search.query_parser import parse_query
from app.search.ranking import RankedProduct, rank_products
from app.services.catalog_service import CatalogService
from app.services.stock_service import StockSnapshot, get_stock_snapshot


class AssistantTools:
    def __init__(
        self,
        catalog: CatalogService,
        pdf_extractor: PdfExtractor | None = None,
        image_extractor: ImageExtractor | None = None,
        *,
        database: Any = None,
        ekt_client: Any = None,
        cart_actions: Any = None,
    ) -> None:
        self.catalog = catalog
        self.database = database
        self.ekt_client = ekt_client
        self.cart_actions = cart_actions
        self.pdf_extractor = pdf_extractor
        self.image_extractor = image_extractor

    async def _search_catalog(self, text: str, limit: int) -> list[ProductListItem]:
        if self.database is not None and self.database.pool is not None:
            return await self.database.search_products(text, limit)
        return self.catalog.search(text)[:limit]

    async def get_product(self, product_id: int) -> ProductListItem | None:
        if self.database is not None and self.database.pool is not None:
            product = await self.database.find_product(product_id)
            if product is not None:
                return product
        return self.catalog.get_product(product_id)

    async def search_products(self, text: str, limit: int = 10) -> list[RankedProduct]:
        query = parse_query(text)
        candidates: list[ProductListItem] = []
        if query.product_id is not None:
            product = await self.get_product(query.product_id)
            if product is None:
                detail = await self.get_product_detail(query.product_id)
                product = detail_to_list_item(detail) if detail else None
            if product is not None:
                candidates.append(product)
        if query.article:
            candidates.extend(await self._search_catalog(query.article, limit))
        if query.search_text:
            candidates.extend(await self._search_catalog(query.search_text, limit))
        for term in query.terms:
            candidates.extend(await self._search_catalog(term, limit))
        return rank_products(query, candidates, limit)

    async def find_alternatives(
        self, product_id: int, limit: int = 5, *, store_id: int | None = None,
        text: str = "", city: str | None = None,
    ) -> list[Alternative]:
        source = await self.get_product(product_id)
        source_detail = await self.get_product_detail(product_id)
        if source is None and source_detail is not None:
            source = detail_to_list_item(source_detail)
        if source is None:
            return []
        candidates: dict[int, ProductListItem] = {}
        details: dict[int, ProductDetail | None] = {}
        stocks: dict[int, StockSnapshot] = {}
        for term in source.name.split()[:5]:
            if len(term) > 2:
                for found in await self._search_catalog(term, 30):
                    if found.id == product_id or found.id in candidates:
                        continue
                    canonical = await self.get_product(found.id)
                    if canonical is None:
                        continue
                    candidates[canonical.id] = canonical
                    if len(candidates) >= 30:
                        break
            if len(candidates) >= 30:
                break
        for candidate_id in list(candidates):
            detail = await self.get_product_detail(candidate_id)
            details[candidate_id] = detail
            stocks[candidate_id] = await self.get_product_stock(
                candidate_id, store_id=store_id, text=text, city=city, detail=detail,
            )
        return find_alternatives(
            source, candidates.values(), limit, source_detail=source_detail,
            candidate_details=details, stocks=stocks,
        )

    async def get_product_detail(self, product_id: int) -> ProductDetail | None:
        if self.ekt_client is not None and self.ekt_client.configured:
            detail = await self.ekt_client.get_product_detail(product_id)
            if detail.id != product_id:
                raise ValueError("EKT returned detail for a different product")
            self.catalog.remember_detail(detail)
            if self.database is not None:
                await self.database.save_product(detail_to_list_item(detail), detail)
            return detail
        detail = self.catalog.get_detail(product_id)
        if detail is None and self.database is not None:
            detail = await self.database.find_detail(product_id)
        if detail is not None and detail.id != product_id:
            raise ValueError("Catalog returned detail for a different product")
        return detail

    async def get_product_stock(
        self, product_id: int, *, store_id: int | None = None, text: str = "",
        city: str | None = None, detail: ProductDetail | None = None,
    ) -> StockSnapshot:
        if detail is None:
            detail = await self.get_product_detail(product_id)
        if detail is not None and detail.id != product_id:
            raise ValueError("Catalog returned detail for a different product")
        return get_stock_snapshot(detail, store_id, text, city)

    async def prepare_cart_confirmation(
        self, *, session_id: str, product_id: int, quantity: int,
        detail: ProductDetail, stock: StockSnapshot,
    ) -> dict[str, Any]:
        """Persist a pending action; never perform a browser-session cart mutation."""
        if self.cart_actions is None:
            raise RuntimeError("Cart proposal service is unavailable")
        if detail.id != product_id or quantity <= 0 or stock.quantity is None or quantity > stock.quantity:
            raise ValueError("Product, quantity or confirmed stock is invalid")
        if not stock.scoped or not stock.store_name:
            raise ValueError("A confirmed city or warehouse is required")
        return await self.cart_actions.propose(
            session_id=session_id, product_id=product_id, quantity=quantity,
            city=stock.store_name, detail=detail,
        )

    def parse_document(self, filename: str, data: bytes) -> ParsedDocument:
        safe_name = PurePath(filename.replace("\\", "/")).name
        extension = PurePath(safe_name).suffix.casefold()
        if extension == ".pdf":
            return parse_pdf(data, safe_name, self.pdf_extractor)
        if extension == ".xlsx":
            return parse_excel(data, safe_name)
        if extension == ".docx":
            return parse_word(data, safe_name)
        if extension in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            return parse_image(data, safe_name, self.image_extractor)
        raise ValueError("Unsupported document format")
