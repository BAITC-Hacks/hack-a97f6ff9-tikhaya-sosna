"""Validate PDF input and normalize output from a configured text extractor."""

from __future__ import annotations

from collections.abc import Callable, Iterable

from app.documents import DocumentSection, ParsedDocument, check_size


PdfExtractor = Callable[[bytes], Iterable[DocumentSection]]


def parse_pdf(data: bytes, filename: str = "", extractor: PdfExtractor | None = None) -> ParsedDocument:
    check_size(data)
    if not data.startswith(b"%PDF-"):
        raise ValueError("Invalid PDF signature")
    if extractor is None:
        return ParsedDocument(filename, "pdf", (), ("Извлечение текста PDF не настроено",))

    sections = tuple(extractor(data))
    if not all(isinstance(section, DocumentSection) for section in sections):
        raise ValueError("PDF extractor returned an invalid section")
    warnings = () if sections else ("Текст PDF не извлечён",)
    return ParsedDocument(filename, "pdf", sections, warnings)
