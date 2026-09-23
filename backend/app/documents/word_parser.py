"""Read paragraphs and tables from a DOCX archive using the standard library."""

from __future__ import annotations

from xml.etree import ElementTree

from app.documents import DocumentSection, ParsedDocument, open_office_archive


_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _paragraph_text(element: ElementTree.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        if node.tag == f"{_W}t" and node.text:
            parts.append(node.text)
        elif node.tag == f"{_W}tab":
            parts.append("\t")
        elif node.tag in (f"{_W}br", f"{_W}cr"):
            parts.append("\n")
    return "".join(parts).strip()


def parse_word(data: bytes, filename: str = "") -> ParsedDocument:
    with open_office_archive(data) as archive:
        if "word/document.xml" not in archive.namelist():
            raise ValueError("DOCX does not contain a document body")
        payload = archive.read("word/document.xml")
        if b"<!DOCTYPE" in payload.upper():
            raise ValueError("DOCX XML contains a DTD")
        try:
            root = ElementTree.fromstring(payload)
        except ElementTree.ParseError as exc:
            raise ValueError("Invalid DOCX document XML") from exc

    body = root.find(f"{_W}body")
    if body is None:
        raise ValueError("DOCX does not contain a document body")

    sections: list[DocumentSection] = []
    paragraph_number = 0
    table_number = 0
    for child in body:
        if child.tag == f"{_W}p":
            paragraph_number += 1
            content = _paragraph_text(child)
            if content:
                sections.append(DocumentSection(f"paragraph:{paragraph_number}", content))
        elif child.tag == f"{_W}tbl":
            table_number += 1
            for row_number, row in enumerate(child.findall(f"{_W}tr"), 1):
                cells = []
                for cell in row.findall(f"{_W}tc"):
                    text = " ".join(filter(None, (_paragraph_text(p) for p in cell.iter(f"{_W}p"))))
                    cells.append(text)
                sections.append(DocumentSection(f"table:{table_number}/row:{row_number}", "\t".join(cells)))

    warnings = () if sections else ("Текст DOCX не найден",)
    return ParsedDocument(filename, "docx", tuple(sections), warnings)
