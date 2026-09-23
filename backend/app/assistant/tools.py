"""Restricted catalog and document operations available to the orchestrator."""

from __future__ import annotations

from pathlib import PurePath

from app.documents import ParsedDocument
from app.documents.excel_parser import parse_excel
from app.documents.image_parser import ImageExtractor, parse_image
from app.documents.pdf_parser import PdfExtractor, parse_pdf
from app.documents.word_parser import parse_word
from app.integrations.ekt.schemas import ProductDetail, ProductListItem
from app.search.alternatives import Alternative, find_alternatives
from app.search.query_parser import parse_query
from app.search.ranking import RankedProduct, rank_products
from app.services.catalog_service import CatalogService
from app.services.stock_service import get_stock_snapshot


class AssistantTools:
    def __init__(
        self,
        catalog: CatalogService,
        pdf_extractor: PdfExtractor | None = None,
        image_extractor: ImageExtractor | None = None,
    ) -> None:
        self.catalog = catalog
        self.pdf_extractor = pdf_extractor
        self.image_extractor = image_extractor

    def search_products(self, text: str, limit: int = 10) -> list[RankedProduct]:
        query = parse_query(text)
        candidates = []
        if query.product_id is not None:
            product = self.catalog.get_product(query.product_id)
            if product is not None:
                candidates.append(product)
        if query.article:
            candidates.extend(self.catalog.search(query.article))
        if query.search_text:
            candidates.extend(self.catalog.search(query.search_text))
        for term in query.terms:
            candidates.extend(self.catalog.search(term))
        return rank_products(query, candidates, limit)

    def find_alternatives(
        self, product_id: int, limit: int = 5, *, store_id: int | None = None, text: str = "",
    ) -> list[Alternative]:
        source = self.catalog.get_product(product_id)
        source_detail = self.catalog.get_detail(product_id)
        if source_detail is not None and source_detail.id != product_id:
            return []
        if source is None and source_detail is not None:
            source = ProductListItem.model_validate(source_detail.model_dump(include={"id", "name", "article", "price", "url"}))
        if source is None:
            return []
        candidates: dict[int, ProductListItem] = {}
        details: dict[int, ProductDetail | None] = {}
        stocks = {}
        for term in source.name.split():
            if len(term) > 2:
                for found in self.catalog.search(term):
                    if found.id == product_id or found.id in candidates:
                        continue
                    canonical = self.catalog.get_product(found.id)
                    if canonical is None:
                        continue
                    detail = self.catalog.get_detail(canonical.id)
                    if detail is not None and detail.id != canonical.id:
                        continue
                    candidates[canonical.id] = canonical
                    details[canonical.id] = detail
                    stocks[canonical.id] = get_stock_snapshot(detail, store_id, text)
        return find_alternatives(
            source, candidates.values(), limit, source_detail=source_detail,
            candidate_details=details, stocks=stocks,
        )

    def get_product_detail(self, product_id: int) -> ProductDetail | None:
        """Read the existing catalog detail without changing product state."""
        return self.catalog.get_detail(product_id)

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
