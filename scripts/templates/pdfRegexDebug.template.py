import json
import re
from pathlib import Path

import pdfplumber


def debug_pdf_sections(pdf_path: str, config_path: str, output_path: str) -> None:
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    text = extract_text(pdf_path)
    sections = {}

    for section_type, patterns in config["section_patterns"].items():
        matches = []
        for pattern in patterns:
            hit = re.search(pattern, text, re.I)
            if hit:
                matches.append({"pattern": pattern, "start": hit.start(), "sample": text[hit.start():hit.start() + 160]})
        sections[section_type] = matches

    question_hits = [
        {"no": match.group(2), "start": match.start(), "sample": text[match.start():match.start() + 120]}
        for match in re.finditer(config["question_start_pattern"], text)
    ]

    Path(output_path).write_text(json.dumps({
        "pdf": pdf_path,
        "text_length": len(text),
        "section_heading_hits": sections,
        "question_hit_count": len(question_hits),
        "question_hits": question_hits[:120],
        "raw_text_sample": text[:4000]
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def extract_text(pdf_path: str) -> str:
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            pages.append(f"\n--- Page {index} ---\n{page.extract_text() or ''}")
    return "\n".join(pages)
