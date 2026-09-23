"""Shared data contract and limits for document extraction."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from zipfile import BadZipFile, ZipFile


MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 2000


@dataclass(frozen=True)
class DocumentSection:
    location: str
    text: str


@dataclass(frozen=True)
class ParsedDocument:
    filename: str
    format: str
    sections: tuple[DocumentSection, ...]
    warnings: tuple[str, ...] = ()


def check_size(data: bytes) -> None:
    if not isinstance(data, bytes) or not data:
        raise ValueError("Document must contain bytes")
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("Document exceeds size limit")


def open_office_archive(data: bytes) -> ZipFile:
    """Open an Office archive after checking its declared expanded size."""
    check_size(data)
    try:
        archive = ZipFile(BytesIO(data))
        entries = archive.infolist()
        if len(entries) > MAX_ARCHIVE_ENTRIES or sum(item.file_size for item in entries) > MAX_EXPANDED_BYTES:
            archive.close()
            raise ValueError("Office archive exceeds extraction limits")
        return archive
    except BadZipFile as exc:
        raise ValueError("Invalid Office document") from exc
