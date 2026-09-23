"""Identify common image formats and normalize optional OCR output."""

from __future__ import annotations

from collections.abc import Callable, Iterable

from app.documents import DocumentSection, ParsedDocument, check_size


ImageExtractor = Callable[[bytes], Iterable[DocumentSection]]


def _detect_format(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    raise ValueError("Unsupported or invalid image format")


def parse_image(data: bytes, filename: str = "", extractor: ImageExtractor | None = None) -> ParsedDocument:
    check_size(data)
    image_format = _detect_format(data)
    if extractor is None:
        return ParsedDocument(filename, image_format, (), ("Распознавание текста изображения не настроено",))

    sections = tuple(extractor(data))
    if not all(isinstance(section, DocumentSection) for section in sections):
        raise ValueError("Image extractor returned an invalid section")
    warnings = () if sections else ("Текст изображения не распознан",)
    return ParsedDocument(filename, image_format, sections, warnings)
