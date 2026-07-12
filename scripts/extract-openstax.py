#!/usr/bin/env python3
"""Extract exercise text from OpenStax Calculus Volume 1 PDF."""

import re
from pathlib import Path

import pypdf

ROOT = Path(__file__).resolve().parent.parent
PDF_CANDIDATES = [
    ROOT / "public" / "references" / "calculus-volume-1_-_WEB.pdf",
    ROOT / "references" / "calculus-volume-1_-_WEB.pdf",
    Path(r"C:\Users\peter\Downloads\Documents\calculus-volume-1_-_WEB.pdf"),
]
OUT = ROOT / "agent-tools" / "openstax-exercises.txt"


def resolve_pdf() -> Path:
    for candidate in PDF_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("OpenStax Vol. 1 PDF not found. Place calculus-volume-1_-_WEB.pdf in public/references/")

# PDF page ranges (0-indexed) from TOC scan
RANGES = {
    "4.10 Antiderivatives": range(426, 438),
    "5.2 Definite Integral": range(462, 478),
    "5.3 FTC": range(478, 490),
    "5.4 Net Change": range(490, 508),
    "5.5 Substitution": range(508, 518),
    "6.1 Areas between curves": range(542, 553),
    "6.2 Volumes slicing": range(553, 571),
    "6.3 Shells": range(571, 584),
    "6.4 Arc/Surface": range(584, 596),
    "6.5 Physical apps": range(596, 612),
    "6.6 Centroids": range(612, 628),
}


def main():
    pdf = resolve_pdf()
    reader = pypdf.PdfReader(str(pdf))
    chunks = [f"OpenStax Calculus Volume 1 — {pdf.name}\n", f"Path: {pdf}\n", f"Pages: {len(reader.pages)}\n\n"]
    for section, pages in RANGES.items():
        chunks.append(f"\n{'=' * 60}\n{section}\n{'=' * 60}\n")
        for i in pages:
            if i >= len(reader.pages):
                continue
            text = reader.pages[i].extract_text() or ""
            if not text.strip():
                continue
            chunks.append(f"\n--- PDF page {i + 1} ---\n{text}\n")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(chunks), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()