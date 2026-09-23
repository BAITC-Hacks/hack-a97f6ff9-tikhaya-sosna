"""Conservative parsing of product-search intent from a user query."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


_IDENTIFIER = re.compile(r"(?i)(?:\bid\s*[:№#]?\s*|#|\bтовар\w*\s*№\s*)(\d+)\b")
_ARTICLE = re.compile(r"(?i)\b(?:артикул|sku)\s*[:№#]?\s*([\w.-]+)")
_MAX_PRICE = re.compile(r"(?i)\b(?:до|не дороже)\s+(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:₸|тг|тенге)?\b")
_WORD = re.compile(r"[\w.-]+", re.UNICODE)
_ADD_REQUEST = re.compile(r"(?i)^\s*(?:пожалуйста[,\s]+)?(?:добавь(?:те)?|добавить|положи(?:те)?|хочу\s+добавить|прошу\s+добавить)\b")
_COUNT = re.compile(r"(?i)(?<![\w.,])([+-]?\d+(?:[.,]\d+)?)\s*(?:шт\.?(?!\w)|штук(?:а|и|у)?\b|единиц(?:а|ы|у)?\b)")
_NAMED_COUNT = re.compile(r"(?i)\b(?:в\s+количестве|количество)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)\b")
_FILLER = frozenset({
    "найди", "найти", "покажи", "показать", "мне", "нужен", "нужна", "нужно",
    "товар", "товары", "купить", "аналог", "аналоги", "альтернатива",
    "альтернативы", "замена", "замену",
    "характеристика", "характеристики", "описание", "описания",
    "параметр", "параметры", "детали", "подробнее", "свойства",
    "спецификация",
    "наличие", "наличии", "остаток", "остатки", "доступно", "сколько", "есть",
})


@dataclass(frozen=True)
class SearchQuery:
    original: str
    terms: tuple[str, ...]
    product_id: int | None = None
    article: str | None = None
    max_price: Decimal | None = None

    @property
    def search_text(self) -> str:
        return " ".join(self.terms)


@dataclass(frozen=True)
class CartIntent:
    requested: bool
    search_text: str
    quantity: int | None = None
    clarification: str | None = None


def parse_cart_intent(text: str) -> CartIntent:
    """Recognize an explicit add request; never infer a missing quantity."""
    action = _ADD_REQUEST.search(text)
    if action is None:
        return CartIntent(False, text)
    if re.search(r"(?i)\b(?:если|когда|потом|позже|либо|или|и)\b|\bне\s+добав", text):
        return CartIntent(True, text, clarification="Уточните, какой товар и сколько штук добавить сейчас.")
    if len(list(_IDENTIFIER.finditer(text))) > 1 or len(list(_ARTICLE.finditer(text))) > 1:
        return CartIntent(True, text, clarification="Укажите один товар для предложения корзины.")

    counts = list(_COUNT.finditer(text)) + list(_NAMED_COUNT.finditer(text))
    if len(counts) > 1:
        return CartIntent(True, text, clarification="Укажите одно количество для одного товара.")
    quantity = None
    search_text = text[action.end():]
    if counts:
        count = counts[0]
        value = count.group(1)
        if not value.isdecimal() or int(value) <= 0:
            return CartIntent(True, text, clarification="Укажите положительное целое количество штук.")
        quantity = int(value)
        search_text = text[action.end():count.start()] + " " + text[count.end():]
    search_text = re.sub(r"(?i)\bв\s+корзин[уы]\b|\bпожалуйста\b", " ", search_text)
    return CartIntent(True, search_text.strip(), quantity)


def parse_query(text: str) -> SearchQuery:
    """Extract only explicit filters; leave uncertain attributes as search terms."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Search query must contain text")
    if len(text) > 2000:
        raise ValueError("Search query is too long")

    normalized = " ".join(text.split())
    id_match = _IDENTIFIER.search(normalized)
    article_match = _ARTICLE.search(normalized)
    price_match = _MAX_PRICE.search(normalized)

    remainder = normalized
    for match in sorted((m for m in (id_match, article_match, price_match) if m), key=lambda m: m.start(), reverse=True):
        remainder = remainder[:match.start()] + " " + remainder[match.end():]

    terms = tuple(dict.fromkeys(token.casefold() for token in _WORD.findall(remainder) if token.casefold() not in _FILLER))
    max_price = None
    if price_match:
        try:
            max_price = Decimal(price_match.group(1).replace(" ", "").replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError("Invalid maximum price") from exc

    return SearchQuery(
        original=normalized,
        terms=terms,
        product_id=int(id_match.group(1)) if id_match else None,
        article=article_match.group(1) if article_match else None,
        max_price=max_price,
    )
