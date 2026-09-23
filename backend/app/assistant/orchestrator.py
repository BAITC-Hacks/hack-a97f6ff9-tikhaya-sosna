"""Coordinate catalog lookup, document extraction and response assembly."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Iterable, Protocol, Sequence
from uuid import uuid4

from app.assistant.prompts import PromptMessage, build_messages
from app.assistant.response_models import (
    AssistantRequest,
    AssistantResponse,
    AssistantProduct,
    CartProposal,
    ProductDetailResult,
    ProductRecommendation,
    SourceReference,
    StructuredResponse,
)
from app.assistant.tools import AssistantTools
from app.documents import ParsedDocument
from app.integrations.ekt.schemas import ProductDetail, ProductListItem
from app.search.alternatives import Alternative
from app.search.query_parser import CartIntent, SearchQuery, parse_cart_intent, parse_query
from app.search.ranking import RankedProduct
from app.services.stock_service import StockSnapshot, get_stock_snapshot as _stock


_LOGGER = logging.getLogger(__name__)
_ALTERNATIVE_REQUEST = re.compile(r"(?i)\b(?:аналог\w*|альтернатив\w*|замен\w*)\b")
_DETAIL_REQUEST = re.compile(r"(?i)\b(?:характеристик\w*|описани\w*|подробн\w*|детал\w*|параметр\w*|свойств\w*|спецификаци\w*)\b")
_STOCK_REQUEST = re.compile(r"(?i)\b(?:остатк\w*|наличи\w*|на складе)\b")
_TERMS_REQUEST = re.compile(r"(?i)\b(?:услови\w*\s+покупк\w*|оплат\w*|доставк\w*)\b")
_CART_MENTION = re.compile(r"(?i)\b(?:добав\w*|полож\w*)\b|\bв\s+корзину\b")


@dataclass(frozen=True)
class Attachment:
    filename: str
    data: bytes


class TextGenerator(Protocol):
    """Return a JSON object matching the response schema supplied in messages."""

    def generate(self, messages: Sequence[PromptMessage]) -> str: ...


def _empty(message: str, *, clarification: bool = False) -> AssistantResponse:
    return AssistantResponse(message=message, products=[], cart_proposal=None, needs_clarification=clarification)


def _product(product: ProductListItem, detail: ProductDetail | None, stock: StockSnapshot) -> AssistantProduct:
    if detail is not None and detail.id != product.id:
        raise ValueError("Catalog returned detail for a different product")
    return AssistantProduct(
        id=product.id,
        name=detail.name if detail else product.name,
        price=detail.price if detail and detail.price is not None else product.price,
        quantity=stock.quantity,
        url=(detail.url if detail and detail.url else product.url),
    )


def _select_product(query: SearchQuery, products: list[RankedProduct]) -> RankedProduct | None:
    """Require one identified product; ranking alone cannot authorize a proposal."""
    if query.product_id is not None:
        matching = [item for item in products if item.product.id == query.product_id]
    elif query.article:
        matching = [item for item in products if (item.product.article or "").casefold() == query.article.casefold()]
    else:
        exact = [item for item in products if query.search_text == item.product.name.casefold()]
        matching = exact or [item for item in products if query.terms and all(
            term in item.product.name.casefold() or term in (item.product.article or "").casefold()
            for term in query.terms
        )]
    return matching[0] if len(matching) == 1 else None


def _recommendation(item: RankedProduct | Alternative) -> ProductRecommendation:
    product = item.product
    reasons = list(item.reasons) if isinstance(item, RankedProduct) else [item.reason]
    return ProductRecommendation(
        id=product.id,
        name=product.name,
        article=product.article,
        price=product.price,
        url=product.url,
        score=item.score,
        reasons=reasons,
        same=list(item.same) if isinstance(item, Alternative) else [],
        different=list(item.different) if isinstance(item, Alternative) else [],
    )


def _catalog_answer(
    products: list[RankedProduct],
    alternatives: list[Alternative],
    documents: list[ParsedDocument],
    detail: ProductDetail | None,
) -> str:
    parts: list[str] = []
    if products:
        names = ", ".join(item.product.name for item in products[:3])
        parts.append(f"В каталоге найдены товары: {names}.")
    if alternatives:
        for item in alternatives[:3]:
            description = f"Альтернатива: {item.product.name}."
            if item.same:
                description += f" Совпадает: {', '.join(item.same)}."
            if item.different:
                description += f" Отличается: {', '.join(item.different)}."
            if not item.same and not item.different:
                description += " Подтверждённых характеристик для сравнения нет."
            if item.stock_scoped:
                if item.available_quantity is None:
                    description += " Наличие в выбранном городе не подтверждено."
                elif item.available_quantity == 0:
                    description += " В выбранном городе товара нет в наличии."
                else:
                    description += f" В {item.store_name or 'выбранном городе'} подтверждено {item.available_quantity} шт."
            parts.append(description + " Совместимость не подтверждена.")
    if detail is not None:
        if detail.description:
            parts.append(f"Описание {detail.name}: {detail.description[:1000]}.")
        if detail.properties:
            properties = ", ".join(f"{key}: {value}" for key, value in list(detail.properties.items())[:8])
            parts.append(f"Характеристики: {properties}.")
    if documents:
        extracted = sum(len(document.sections) for document in documents)
        parts.append(f"Из документов извлечено фрагментов: {extracted}.")
        if extracted:
            parts.append("Для ответа по содержимому документов требуется настроить генерацию текста.")
    return " ".join(parts) if parts else "По текущему каталогу ничего не найдено. Уточните название, артикул или ID товара."


def _detail_id(query_id: int | None, article: str | None, products: list[RankedProduct]) -> int | None:
    if query_id is not None:
        return query_id
    if article:
        for item in products:
            if (item.product.article or "").casefold() == article.casefold():
                return item.product.id
    if len(products) == 1 or (len(products) > 1 and products[0].score > products[1].score):
        return products[0].product.id
    return None


class AssistantOrchestrator:
    def __init__(self, tools: AssistantTools, generator: TextGenerator | None = None) -> None:
        self.tools = tools
        self.generator = generator

    def answer(
        self,
        request: AssistantRequest,
        attachments: Iterable[Attachment] = (),
    ) -> AssistantResponse:
        try:
            return self._answer(request, attachments)
        except Exception as exc:
            _LOGGER.warning("Assistant request failed: %s", type(exc).__name__)
            return _empty("Не удалось обработать запрос. Попробуйте ещё раз.")

    def _lookup(self, text: str, product_id: int | None = None) -> tuple[SearchQuery, list[RankedProduct], dict[int, ProductDetail | None]]:
        query = parse_query(text or "товар")
        if product_id is not None:
            if query.product_id is not None and query.product_id != product_id:
                raise ValueError("Conflicting product identifiers")
            query = parse_query(f"id:{product_id}")
        search_text = f"id:{query.product_id}" if query.product_id is not None else query.original
        products = self.tools.search_products(search_text) if query.terms or query.article or query.product_id is not None else []
        details: dict[int, ProductDetail | None] = {}
        if query.product_id is not None:
            products = [item for item in products if item.product.id == query.product_id]
            if not products:
                detail = self.tools.get_product_detail(query.product_id)
                details[query.product_id] = detail
                if detail is not None:
                    if detail.id != query.product_id:
                        raise ValueError("Catalog returned detail for a different product")
                    product = ProductListItem.model_validate(detail.model_dump(include={"id", "name", "article", "price", "url", "image"}))
                    products = [RankedProduct(product, 100, ("совпадение по ID",))]
        elif query.article:
            products = [item for item in products if (item.product.article or "").casefold() == query.article.casefold()]
        return query, products, details

    def _cart_response(self, request: AssistantRequest, intent: CartIntent) -> AssistantResponse:
        if intent.clarification:
            return _empty(intent.clarification, clarification=True)
        if request.quantity is not None and intent.quantity is not None and request.quantity != intent.quantity:
            return _empty("В запросе указаны разные количества. Уточните количество штук.", clarification=True)
        quantity = request.quantity if request.quantity is not None else intent.quantity
        query, products, details = self._lookup(intent.search_text, request.product_id)
        selected = _select_product(query, products)
        if selected is None:
            return _empty("Укажите один точный товар: ID, артикул или полное название.", clarification=True)
        product = selected.product
        detail = details.get(product.id) if product.id in details else self.tools.get_product_detail(product.id)
        stock = _stock(detail, request.store_id, request.message)
        public_product = _product(product, detail, stock)
        response = AssistantResponse(message="Укажите количество штук для добавления.", products=[public_product], cart_proposal=None)
        if quantity is None:
            response.needs_clarification = True
        elif stock.clarification:
            response.message = stock.clarification
            response.needs_clarification = True
        elif stock.quantity is None:
            response.message = "Остаток товара не подтверждён. Предложение корзины пока не создано."
        elif quantity > stock.quantity:
            response.message = f"Запрошено {quantity} шт., подтверждено только {stock.quantity} шт. Укажите меньшее количество."
            response.needs_clarification = True
        else:
            response.cart_proposal = CartProposal(
                action_id=f"ca_{uuid4().hex}", product_id=public_product.id, product_name=public_product.name,
                quantity=quantity, available_quantity=stock.quantity, status="pending_confirmation",
            )
            response.message = f"Готов добавить {quantity} шт. Подтвердите действие."
        return response

    def _answer(self, request: AssistantRequest, attachments: Iterable[Attachment]) -> AssistantResponse:
        query = parse_query(request.message)
        if request.product_id is not None and query.product_id is not None and request.product_id != query.product_id:
            return _empty("В запросе указаны разные товары. Уточните ID товара.", clarification=True)
        intent = parse_cart_intent(request.message)
        if intent.requested:
            return self._cart_response(request, intent)
        if _CART_MENTION.search(request.message):
            return _empty("Предложение не создано. Для добавления явно укажите товар и количество.", clarification=True)
        if _TERMS_REQUEST.search(request.message):
            return _empty("Условия покупки пока недоступны.")
        query, products, details = self._lookup(request.message, request.product_id)
        alternatives: list[Alternative] = []
        selected = _select_product(query, products)
        alternative_requested = bool(_ALTERNATIVE_REQUEST.search(request.message))
        if selected and alternative_requested:
            alternatives = self.tools.find_alternatives(
                selected.product.id, store_id=request.store_id, text=request.message,
            )

        detail_requested = bool(_DETAIL_REQUEST.search(request.message))
        detail_id = _detail_id(query.product_id, query.article, products) if detail_requested else None
        all_products = {item.product.id: item.product for item in [*products, *alternatives]}
        for product_id in all_products:
            if product_id not in details:
                details[product_id] = self.tools.get_product_detail(product_id)
        detail = details.get(detail_id)
        stock_requested = bool(_STOCK_REQUEST.search(request.message))
        stocks = {product_id: _stock(details.get(product_id), request.store_id, request.message if stock_requested or alternative_requested else "")
                  for product_id in all_products}
        public_products = [_product(product, details.get(product.id), stocks[product.id]) for product in all_products.values()]

        documents: list[ParsedDocument] = []
        warnings: list[str] = []
        for attachment in attachments:
            document = self.tools.parse_document(attachment.filename, attachment.data)
            documents.append(document)
            warnings.extend(f"{document.filename}: {warning}" for warning in document.warnings)

        answer = _catalog_answer(products, alternatives, documents, detail)
        if detail_requested and detail_id is None and products:
            answer += " Уточните ID или артикул товара, характеристики которого нужны."
        elif detail_requested and detail_id is not None and detail is None:
            answer += " Подробные сведения об этом товаре сейчас отсутствуют."
        if alternative_requested and products and not alternatives:
            answer += " Подтверждённых альтернатив не найдено."
        if alternative_requested and products and selected is None:
            answer += " Уточните ID или артикул исходного товара."
        if warnings:
            answer += " " + " ".join(warnings)
        if stock_requested and products and not alternative_requested:
            if selected is None:
                answer = "Уточните ID или артикул товара, остаток которого нужен."
            else:
                stock = stocks[selected.product.id]
                if stock.clarification:
                    answer = stock.clarification
                elif stock.quantity is None:
                    answer = "Остаток товара не подтверждён."
                else:
                    location = f"На складе «{stock.store_name}»" if stock.store_name else "По данным каталога"
                    answer = f"{location} доступно {stock.quantity} шт."
        response = AssistantResponse(message=answer, products=public_products, cart_proposal=None)
        if self.generator is not None and (not stock_requested or alternative_requested) and (public_products or documents) and not (alternative_requested and not alternatives):
            generated = self.generator.generate(
                build_messages(request.message, products, alternatives, documents, detail=detail, response=response)
            )
            if not isinstance(generated, str):
                raise ValueError("Generator must return a JSON object")
            validated = StructuredResponse.model_validate_json(generated)
            if validated.products != response.products or validated.cart_proposal != response.cart_proposal:
                raise ValueError("Generator changed authoritative catalog data")
            response.message = validated.message
            response.mode = "generated"

        sources = [
            SourceReference(kind="product", identifier=str(item.product.id), url=item.product.url)
            for item in [*products, *alternatives]
        ]
        sources.extend(
            SourceReference(kind="document", identifier=document.filename)
            for document in documents if document.sections
        )
        if detail is not None and not any(source.kind == "product" and source.identifier == str(detail.id) for source in sources):
            sources.append(SourceReference(kind="product", identifier=str(detail.id), url=detail.url))

        response.alternatives = [_recommendation(item) for item in alternatives]
        response.sources = sources
        response.warnings = warnings
        response.needs_clarification = (detail_requested and detail_id is None and bool(products)) or ((stock_requested or alternative_requested) and selected is None and bool(products))
        if detail is not None:
            response.detail = ProductDetailResult.model_validate(detail.model_dump(include={"id", "name", "article", "description", "price", "properties"}))
        return response
