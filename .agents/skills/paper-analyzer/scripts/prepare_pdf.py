#!/usr/bin/env python3
"""Prepare page-preserving local PDF evidence. No analysis or AI calls."""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CACHE = ROOT / ".qa" / "paper-analyzer"
SCHEMA = ROOT / "analysis" / "schema" / "paper-analysis.schema.json"


def fingerprint(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def project_path(value):
    path = Path(value).expanduser()
    return (path if path.is_absolute() else ROOT / path).resolve()


def page_flags(text):
    count = sum(not char.isspace() for char in text)
    flags = []
    if count == 0:
        flags.append("no_extractable_text")
    elif count < 80:
        flags.append("sparse_text")
    if "\ufffd" in text or "\x00" in text:
        flags.append("replacement_or_null_characters")
    return count, flags


def parse_pages(value, page_count):
    selected = set()
    for part in value.split(","):
        part = part.strip()
        if "-" in part:
            boundaries = part.split("-")
            if len(boundaries) != 2:
                raise ValueError("Invalid page range")
            first, last = map(int, boundaries)
        else:
            first = last = int(part)
        if first < 1 or last < first or last > page_count:
            raise ValueError(f"Page range must stay within 1..{page_count}")
        selected.update(range(first, last + 1))
    if not selected:
        raise ValueError("Select at least one page")
    return sorted(selected)


def prepare(pdf_value):
    pdf = project_path(pdf_value)
    if not pdf.is_file():
        raise ValueError(f"PDF not found: {pdf}")
    if pdf.suffix.lower() != ".pdf":
        raise ValueError("Input must be a PDF file")
    if not SCHEMA.is_file():
        raise ValueError(f"Project Schema not found: {SCHEMA}")
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise RuntimeError("Missing pypdf. Use an existing/bundled Python with pypdf, or install pypdf with authorized permissions.") from error

    before = fingerprint(pdf)
    reader = PdfReader(str(pdf))
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("Encrypted PDF cannot be read without an authorized password/unlocked copy")
    page_count = len(reader.pages)
    if not page_count:
        raise ValueError("PDF has no pages")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = f"paper-{before[:12]}-{stamp}-{uuid.uuid4().hex[:8]}"
    directory = CACHE / run_id
    pages_directory = directory / "pages"
    pages_directory.mkdir(parents=True, exist_ok=False)
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        extraction_error = None
        try:
            try:
                text = page.extract_text(extraction_mode="layout") or ""
            except TypeError:
                text = page.extract_text() or ""
        except Exception as error:
            text = ""
            extraction_error = str(error)
        characters, flags = page_flags(text)
        if extraction_error:
            flags.append("extraction_failed")
        filename = f"page-{index:04d}.txt"
        (pages_directory / filename).write_text(text, encoding="utf-8")
        pages.append({"pdfPage": index, "printedPage": None, "textFile": f"pages/{filename}", "characters": characters, "warnings": flags, "extractionError": extraction_error})
    if fingerprint(pdf) != before:
        raise ValueError("Source PDF changed during extraction; prepare it again")
    metadata = reader.metadata
    hints = {"title": str(metadata.title) if metadata and metadata.title else None, "author": str(metadata.author) if metadata and metadata.author else None}
    source = {"fileName": pdf.name, "sha256": before, "pageCount": page_count, "url": None}
    manifest = {
        "manifestVersion": 1,
        "inputPdf": str(pdf),
        "sourceDocument": source,
        "schemaSha256": fingerprint(SCHEMA),
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "suggestedPaperId": f"paper-{before[:16]}",
        "metadataHints": hints,
        "pages": pages,
        "draftFile": "draft.json",
        "summaryDraftFile": "summary.md",
        "resultFile": f"{run_id}.json",
        "summaryFile": f"{run_id}.summary.md",
        "readingNotice": "PDF physical pages are 1-based. Printed page labels require visual confirmation. Text extraction does not validate tables, formulas, images, claims or quotations.",
    }
    path = directory / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "manifest": str(path), "pagesDirectory": str(pages_directory),
        "draft": str(directory / "draft.json"), "summaryDraft": str(directory / "summary.md"),
        "result": str(ROOT / "analysis" / "results" / manifest["resultFile"]),
        "summary": str(ROOT / "analysis" / "results" / manifest["summaryFile"]),
        "pageCount": page_count, "pagesNeedingVisualReview": [page["pdfPage"] for page in pages if page["warnings"]],
    }


def render(manifest_value, page_selection):
    path = project_path(manifest_value)
    if not path.is_relative_to(CACHE.resolve()) or path.name != "manifest.json":
        raise ValueError("Use a manifest generated inside .qa/paper-analyzer/")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("manifestVersion") != 1:
        raise ValueError("Unsupported manifest version")
    pdf = Path(manifest["inputPdf"])
    if fingerprint(pdf) != manifest["sourceDocument"]["sha256"]:
        raise ValueError("Source PDF changed; prepare it again")
    selected = parse_pages(page_selection, manifest["sourceDocument"]["pageCount"])
    renderer = shutil.which("pdftoppm")
    fitz_document = None
    if renderer is None:
        try:
            import fitz
        except ImportError as error:
            raise RuntimeError("No renderer found. Use existing Poppler pdftoppm or PyMuPDF; report visual review as incomplete until available.") from error
        fitz_document = fitz.open(str(pdf))
    outputs = []
    try:
        for page in selected:
            prefix = path.parent / f"pdf-page-{page:04d}-{uuid.uuid4().hex[:6]}"
            output = prefix.with_suffix(".png")
            if renderer:
                result = subprocess.run([renderer, "-f", str(page), "-l", str(page), "-scale-to", "1800", "-singlefile", "-png", str(pdf), str(prefix)], capture_output=True, text=True, errors="replace", timeout=120)
                if result.returncode:
                    raise RuntimeError(f"pdftoppm failed: {result.stderr.strip()}")
            else:
                selected_page = fitz_document[page - 1]
                scale = 1800 / max(selected_page.rect.width, selected_page.rect.height)
                selected_page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).save(str(output))
            if not output.is_file():
                raise RuntimeError(f"Renderer did not create {output}")
            outputs.append({"pdfPage": page, "image": str(output)})
    finally:
        if fitz_document:
            fitz_document.close()
    return {"renderedPages": outputs, "notice": "Open these images to inspect them; rendering alone is not content verification."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare_command = commands.add_parser("prepare", help="Extract local PDF text into a unique cache run")
    prepare_command.add_argument("pdf")
    render_command = commands.add_parser("render", help="Render selected physical PDF pages for visual inspection")
    render_command.add_argument("manifest")
    render_command.add_argument("--pages", required=True, help="1-based pages, e.g. 1,3-5")
    args = parser.parse_args()
    try:
        result = prepare(args.pdf) if args.command == "prepare" else render(args.manifest, args.pages)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
