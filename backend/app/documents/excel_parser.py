"""Read XLSX worksheets and shared strings using the standard library."""

from __future__ import annotations

import posixpath
from xml.etree import ElementTree
from zipfile import ZipFile

from app.documents import DocumentSection, ParsedDocument, open_office_archive


_S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
_P = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_MAX_CELLS = 100_000


def _xml(archive: ZipFile, path: str) -> ElementTree.Element:
    try:
        payload = archive.read(path)
    except KeyError as exc:
        raise ValueError(f"XLSX is missing {path}") from exc
    if b"<!DOCTYPE" in payload.upper():
        raise ValueError("XLSX XML contains a DTD")
    try:
        return ElementTree.fromstring(payload)
    except ElementTree.ParseError as exc:
        raise ValueError(f"Invalid XLSX XML: {path}") from exc


def _shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = _xml(archive, "xl/sharedStrings.xml")
    return ["".join(node.text or "" for node in item.iter(f"{_S}t")) for item in root.findall(f"{_S}si")]


def _worksheets(archive: ZipFile) -> list[tuple[str, str]]:
    workbook = _xml(archive, "xl/workbook.xml")
    relationships = _xml(archive, "xl/_rels/workbook.xml.rels")
    targets = {
        relation.get("Id"): relation.get("Target", "")
        for relation in relationships.findall(f"{_P}Relationship")
    }
    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall(f"{_S}sheets/{_S}sheet"):
        target = targets.get(sheet.get(_REL_ID))
        if not target:
            raise ValueError("XLSX worksheet relationship is missing")
        path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
        if not path.startswith("xl/worksheets/") or path not in archive.namelist():
            raise ValueError("XLSX worksheet target is invalid")
        sheets.append((sheet.get("name") or "sheet", path))
    return sheets


def _cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> str:
    cell_type = cell.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(f"{_S}is")
        return "" if inline is None else "".join(node.text or "" for node in inline.iter(f"{_S}t"))
    value = cell.findtext(f"{_S}v")
    if value is None:
        return ""
    if cell_type == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError) as exc:
            raise ValueError("Invalid XLSX shared-string index") from exc
    if cell_type == "b":
        return "TRUE" if value == "1" else "FALSE"
    return value


def parse_excel(data: bytes, filename: str = "") -> ParsedDocument:
    sections: list[DocumentSection] = []
    with open_office_archive(data) as archive:
        strings = _shared_strings(archive)
        sheets = _worksheets(archive)
        cell_count = 0
        for sheet_name, path in sheets:
            worksheet = _xml(archive, path)
            for row in worksheet.findall(f"{_S}sheetData/{_S}row"):
                cells: list[str] = []
                for cell in row.findall(f"{_S}c"):
                    cell_count += 1
                    if cell_count > _MAX_CELLS:
                        raise ValueError("XLSX exceeds cell limit")
                    value = _cell_value(cell, strings)
                    if value:
                        cells.append(f"{cell.get('r', '?')}={value}")
                if cells:
                    sections.append(DocumentSection(f"{sheet_name}/row:{row.get('r', '?')}", "\t".join(cells)))

    warnings = () if sections else ("Данные XLSX не найдены",)
    return ParsedDocument(filename, "xlsx", tuple(sections), warnings)
