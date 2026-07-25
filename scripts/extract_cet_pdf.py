from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import shutil
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "configs" / "cet_pdf_extract_config.json"


@dataclass
class SourceFiles:
    question_pdf: Path | None
    answer_pdf: Path | None
    audio_file: Path | None
    folder: Path


def main() -> None:
    started = time.perf_counter()
    parser = argparse.ArgumentParser(description="Extract one CET paper folder into Mongo/SQLite import JSON.")
    parser.add_argument("--input", required=True, help="Folder containing question PDF, answer PDF and MP3.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Extraction config JSON.")
    parser.add_argument("--output", default=None, help="Output JSON path.")
    parser.add_argument("--copy-audio", action="store_true", help="Copy MP3 into output audio folder and use local URL.")
    parser.add_argument("--max-pages", type=int, default=0, help="Limit PDF pages for debugging. 0 means all pages.")
    parser.add_argument("--verbose", action="store_true", help="Print detailed parser logs.")
    args = parser.parse_args()

    config = read_config(Path(args.config))
    input_dir = Path(args.input).resolve()
    output_dir = (ROOT / config["output_dir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(output_dir, args.verbose)

    logging.info("START input=%s", input_dir)
    logging.info("deps pdfplumber=%s pypdf=%s", bool(pdfplumber), bool(PdfReader))

    with timed("discover files"):
        files = discover_source_files(input_dir)
    if not files.question_pdf:
        raise FileNotFoundError(f"No question PDF found in {input_dir}")

    with timed("infer metadata"):
        meta = infer_paper_meta(input_dir, files.question_pdf.name)
        paper_id = make_paper_id(meta, files.question_pdf)

    with timed(f"extract question text {files.question_pdf.name}"):
        question_result = extract_pdf_text(files.question_pdf, max_pages=args.max_pages)
        question_text = clean_text(question_result["text"], config)

    with timed("split sections"):
        sections_text = split_sections(question_text, config)

    answer_map: dict[int, dict[str, Any]] = {}
    answer_result: dict[str, Any] = {"text": "", "method": "none", "page_count": 0, "errors": []}
    if files.answer_pdf:
        with timed(f"extract answer text {files.answer_pdf.name}"):
            answer_result = extract_pdf_text(files.answer_pdf, max_pages=args.max_pages)
            answer_text = clean_text(answer_result["text"], config)
        with timed("parse answers"):
            answer_map = parse_answer_pdf(answer_text, config)

    with timed("resolve audio"):
        audio_url = resolve_audio_url(files.audio_file, output_dir, paper_id, config, args.copy_audio)

    with timed("build document"):
        document = build_import_document(
            paper_id=paper_id,
            meta=meta,
            files=files,
            audio_url=audio_url,
            sections_text=sections_text,
            answer_map=answer_map,
            config=config,
        )
        document["extract_meta"].update(
            {
                "question_extract": summarize_extract_result(question_result),
                "answer_extract": summarize_extract_result(answer_result),
                "answer_count": len(answer_map),
                "elapsed_seconds": round(time.perf_counter() - started, 3),
                "parser_version": "safe-python-v2",
            }
        )

    output_path = Path(args.output).resolve() if args.output else output_dir / f"{paper_id}.mongo-import.json"
    with timed(f"write output {output_path}"):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    result = {
        "ok": True,
        "paper_id": paper_id,
        "output": str(output_path),
        "question_chars": len(question_text),
        "sections": {key: len(value) for key, value in sections_text.items()},
        "questions": len(document["questions"]),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "warnings": document["extract_meta"].get("warnings", []),
    }
    logging.info("DONE %s", json.dumps(result, ensure_ascii=False))
    print(json.dumps(result, ensure_ascii=False, indent=2))


def setup_logging(output_dir: Path, verbose: bool) -> None:
    log_file = output_dir / "cet_pdf_extract.log"
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(log_file, encoding="utf-8"), logging.StreamHandler()],
        force=True,
    )


@contextmanager
def timed(label: str):
    started = time.perf_counter()
    logging.info("STEP start: %s", label)
    try:
        yield
        logging.info("STEP done: %s %.3fs", label, time.perf_counter() - started)
    except Exception:
        logging.exception("STEP failed: %s %.3fs", label, time.perf_counter() - started)
        raise


def read_config(path: Path) -> dict[str, Any]:
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            raw = {}
    else:
        raw = {}
    return {
        "output_dir": raw.get("output_dir", "backend/data/extracted"),
        "local_audio_public_prefix": raw.get("local_audio_public_prefix", "/uploads/audio"),
        "default_scores": {
            "single_choice": 2.5,
            "multiple_choice": 3,
            "blank": 2,
            "subjective_translation": 15,
            "subjective_writing": 15,
            **raw.get("default_scores", {}),
        },
        "noise_patterns": raw.get("noise_patterns", []),
    }


def discover_source_files(folder: Path) -> SourceFiles:
    pdfs = sorted(folder.rglob("*.pdf"))
    audios = sorted([*folder.rglob("*.mp3"), *folder.rglob("*.m4a"), *folder.rglob("*.wav")])
    question_pdf = first_match(
        pdfs,
        include=[r"真题", r"试题", r"题目", r"paper", r"question"],
        exclude=[r"答案", r"解析", r"详解", r"answer", r"analysis"],
    )
    answer_pdf = first_match(pdfs, include=[r"答案", r"解析", r"详解", r"answer", r"analysis"])
    audio_file = audios[0] if audios else None
    logging.info("FOUND question=%s answer=%s audio=%s", question_pdf, answer_pdf, audio_file)
    return SourceFiles(question_pdf=question_pdf, answer_pdf=answer_pdf, audio_file=audio_file, folder=folder)


def first_match(paths: list[Path], include: list[str], exclude: list[str] | None = None) -> Path | None:
    exclude = exclude or []
    for item in paths:
        name = item.name
        if any(re.search(pattern, name, re.I) for pattern in include) and not any(re.search(pattern, name, re.I) for pattern in exclude):
            return item
    return paths[0] if paths else None


def infer_paper_meta(folder: Path, file_name: str) -> dict[str, Any]:
    text = f"{folder} {file_name}"
    year_match = re.search(r"(20\d{2})", text)
    month_match = re.search(r"(?:年|[-_/ .])(0?[369]|1[02])\s*(?:月)?", text)
    level = "CET4" if re.search(r"CET4|四级|4级", text, re.I) else "CET6" if re.search(r"CET6|六级|6级", text, re.I) else "CET4"
    set_match = re.search(r"(?:第|set\s*)\s*([一二三123])\s*(?:套)?", text, re.I)
    return {
        "level": level,
        "year": int(year_match.group(1)) if year_match else None,
        "month": int(month_match.group(1)) if month_match else None,
        "set_num": normalize_set_num(set_match.group(1) if set_match else None) or 1,
    }


def normalize_set_num(value: str | None) -> int | None:
    return {"一": 1, "二": 2, "三": 3, "1": 1, "2": 2, "3": 3}.get(value or "")


def make_paper_id(meta: dict[str, Any], question_pdf: Path) -> str:
    base = f"{meta['level']}-{meta.get('year')}-{meta.get('month')}-{meta.get('set_num')}"
    digest = hashlib.sha1(str(question_pdf).encode("utf-8")).hexdigest()[:8]
    return f"{base}-{digest}".lower()


def extract_pdf_text(pdf_path: Path, max_pages: int = 0) -> dict[str, Any]:
    errors: list[str] = []
    for method in (extract_with_pdfplumber, extract_with_pypdf):
        method_name = method.__name__.replace("extract_with_", "")
        try:
            started = time.perf_counter()
            text, page_count = method(pdf_path, max_pages=max_pages)
            elapsed = round(time.perf_counter() - started, 3)
            logging.info("PDF method=%s file=%s pages=%s chars=%s elapsed=%.3fs", method_name, pdf_path.name, page_count, len(text), elapsed)
            if text.strip():
                return {"text": text, "method": method_name, "page_count": page_count, "elapsed_seconds": elapsed, "errors": errors}
            errors.append(f"{method_name}: empty text")
        except Exception as exc:
            logging.exception("PDF method failed: %s %s", method_name, pdf_path)
            errors.append(f"{method_name}: {type(exc).__name__}: {exc}")
    logging.warning("No text extracted from %s. It may be scanned/image-only/encrypted.", pdf_path)
    return {"text": "", "method": "none", "page_count": 0, "elapsed_seconds": 0, "errors": errors}


def extract_with_pdfplumber(pdf_path: Path, max_pages: int = 0) -> tuple[str, int]:
    if pdfplumber is None:
        raise RuntimeError("pdfplumber is not installed")
    pages: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        selected_pages = pdf.pages[:max_pages] if max_pages else pdf.pages
        for index, page in enumerate(selected_pages, start=1):
            started = time.perf_counter()
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            logging.debug("pdfplumber page=%s chars=%s elapsed=%.3fs", index, len(text), time.perf_counter() - started)
            pages.append(f"\n\n--- Page {index} ---\n{text}")
        return "\n".join(pages), len(pdf.pages)


def extract_with_pypdf(pdf_path: Path, max_pages: int = 0) -> tuple[str, int]:
    if PdfReader is None:
        raise RuntimeError("pypdf is not installed")
    reader = PdfReader(str(pdf_path))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception as exc:
            raise RuntimeError(f"encrypted PDF cannot be decrypted: {exc}") from exc
    selected_pages = reader.pages[:max_pages] if max_pages else reader.pages
    pages = []
    for index, page in enumerate(selected_pages, start=1):
        started = time.perf_counter()
        text = page.extract_text() or ""
        logging.debug("pypdf page=%s chars=%s elapsed=%.3fs", index, len(text), time.perf_counter() - started)
        pages.append(f"\n\n--- Page {index} ---\n{text}")
    return "\n".join(pages), len(reader.pages)


def clean_text(text: str, config: dict[str, Any]) -> str:
    text = text.replace("\u00a0", " ").replace("\ufb01", "fi").replace("\ufb02", "fl")
    text = re.sub(r"[ \t]+", " ", text)
    noise_patterns = [re.compile(pattern, re.I) for pattern in config.get("noise_patterns", []) if isinstance(pattern, str)]
    lines = []
    for line in text.splitlines():
        normalized = line.strip()
        if normalized and any(pattern.search(normalized) for pattern in noise_patterns):
            continue
        lines.append(normalized)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def split_sections(text: str, config: dict[str, Any]) -> dict[str, str]:
    section_patterns = {
        "writing": [r"Part\s*I\s+Writing", r"写作"],
        "listening": [r"Part\s*II\s+Listening\s+Comprehension", r"Listening\s+Comprehension", r"听力"],
        "reading": [r"Part\s*III\s+Reading\s+Comprehension", r"Reading\s+Comprehension", r"阅读"],
        "translation": [r"Part\s*IV\s+Translation", r"Translation", r"翻译"],
    }
    hits: list[tuple[int, str]] = []
    for section_type, patterns in section_patterns.items():
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                hits.append((match.start(), section_type))
                break
    hits.sort()
    sections: dict[str, str] = {}
    for index, (start, section_type) in enumerate(hits):
        end = hits[index + 1][0] if index + 1 < len(hits) else len(text)
        sections[section_type] = text[start:end].strip()
    if not sections:
        sections["reading"] = text
    return sections


def parse_answer_pdf(text: str, config: dict[str, Any]) -> dict[int, dict[str, Any]]:
    answer_map: dict[int, dict[str, Any]] = {}
    if not text.strip():
        return answer_map
    answer_line = re.search(r"((?:\b\d{1,2}\s*[.、)]\s*[A-D]\b[\s,，;；]*){5,})", text, re.I)
    if answer_line:
        for number, answer in re.findall(r"\b(\d{1,2})\s*[.、)]\s*([A-D])\b", answer_line.group(1), re.I):
            answer_map[int(number)] = {"correct_answer": answer.upper(), "explanation": "", "confidence": 0.55}
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        match = re.match(r"^(\d{1,2})\s*[.、)]\s*(.*)$", line)
        if not match:
            continue
        question_no = int(match.group(1))
        tail = match.group(2)
        answer = extract_answer_from_text(tail)
        explanation_lines = [tail]
        for extra in lines[index + 1 : index + 6]:
            if re.match(r"^\d{1,2}\s*[.、)]", extra):
                break
            explanation_lines.append(extra)
        previous = answer_map.get(question_no, {})
        answer_map[question_no] = {
            "correct_answer": answer or previous.get("correct_answer"),
            "explanation": "\n".join(explanation_lines).strip(),
            "confidence": 0.7 if answer else previous.get("confidence", 0.35),
        }
    return answer_map


def extract_answer_from_text(text: str) -> str | list[str] | None:
    patterns = [
        r"(?:答案|Answer|正确答案)\s*[:：]?\s*([A-D](?:\s*[,，/]\s*[A-D])*)",
        r"^\s*([A-D])\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if not match:
            continue
        letters = re.findall(r"[A-D]", match.group(1).upper())
        if len(letters) > 1:
            return letters
        if letters:
            return letters[0]
    return None


def resolve_audio_url(audio_file: Path | None, output_dir: Path, paper_id: str, config: dict[str, Any], copy_audio: bool) -> str:
    if not audio_file:
        return ""
    if not copy_audio:
        return str(audio_file)
    audio_dir = output_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    target = audio_dir / f"{paper_id}{audio_file.suffix.lower()}"
    shutil.copy2(audio_file, target)
    return f"{config.get('local_audio_public_prefix', '/uploads/audio')}/{target.name}"


def build_import_document(
    paper_id: str,
    meta: dict[str, Any],
    files: SourceFiles,
    audio_url: str,
    sections_text: dict[str, str],
    answer_map: dict[int, dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    now = datetime.now(timezone.utc).isoformat()
    exam_id = object_id(paper_id, "exam")
    section_ids = {name: object_id(paper_id, f"section-{name}") for name in ["listening", "reading", "translation", "writing"]}
    audio_id = object_id(paper_id, "audio")
    warnings: list[str] = []

    sections = [
        make_section(section_ids["listening"], exam_id, "listening", "Listening Comprehension", 1, 35, 25, now),
        make_section(section_ids["reading"], exam_id, "reading", "Reading Comprehension", 2, 35, 40, now),
        make_section(section_ids["translation"], exam_id, "translation", "Translation", 3, 15, 30, now),
        make_section(section_ids["writing"], exam_id, "writing",  "Writing", 4, 15, 30, now),
    ]

    passages, reading_questions = parse_reading(sections_text.get("reading", ""), section_ids["reading"], paper_id, answer_map, config, now)
    listening_questions = parse_objective_questions(
        sections_text.get("listening", ""), section_ids["listening"], paper_id, "L", answer_map, config, now, audio_id=audio_id
    )
    subjective_questions = parse_subjective_sections(sections_text, section_ids, paper_id, config, now)

    if not listening_questions:
        warnings.append("No listening questions parsed; placeholder question generated.")
        listening_questions = [placeholder_question(paper_id, section_ids["listening"], "listening", 1, now, audio_id=audio_id)]
    if not reading_questions:
        warnings.append("No reading questions parsed; placeholder question generated.")
        reading_questions = [placeholder_question(paper_id, section_ids["reading"], "reading", 1, now, passage_id=passages[0]["_id"]["$oid"] if passages else None)]
    if not passages:
        warnings.append("No reading passage parsed; placeholder passage generated.")
        passages = [make_passage(object_id(paper_id, "passage-placeholder"), section_ids["reading"], sections_text.get("reading", ""), now)]
    if len(subjective_questions) < 2:
        warnings.append("Subjective sections incomplete; placeholder writing/translation questions may be generated.")
        existing_types = {q["import_meta"]["source_question_no"][0] for q in subjective_questions}
        if "T" not in existing_types:
            subjective_questions.append(placeholder_question(paper_id, section_ids["translation"], "translation", 1, now, qtype="subjective"))
        if "W" not in existing_types:
            subjective_questions.append(placeholder_question(paper_id, section_ids["writing"], "writing", 1, now, qtype="subjective"))

    return {
        "exams": [
            {
                "_id": oid(exam_id),
                "title": f"{meta.get('year')}-{meta.get('month')} {meta['level']} Set {meta['set_num']}",
                "level": meta["level"],
                "year": meta["year"],
                "month": meta["month"],
                "set_num": meta["set_num"],
                "source": "past_exam",
                "source_meta": {
                    "provider": "local-folder",
                    "repo": "DieDiDi/CET4-6-past-exam-paper",
                    "folder_path": str(files.folder),
                    "question_pdf_url": str(files.question_pdf or ""),
                    "answer_pdf_url": str(files.answer_pdf or ""),
                },
                "status": "draft",
                "created_at": date(now),
                "updated_at": date(now),
            }
        ],
        "sections": sections,
        "audio_files": [
            {
                "_id": oid(audio_id),
                "exam_id": oid(exam_id),
                "section_id": oid(section_ids["listening"]),
                "file_url": audio_url,
                "duration": 0,
                "transcript_full": "",
                "source_meta": {"file_name": files.audio_file.name if files.audio_file else "", "raw_url": audio_url},
                "created_at": date(now),
                "updated_at": date(now),
            }
        ] if audio_url else [],
        "passages": passages,
        "questions": [*listening_questions, *reading_questions, *subjective_questions],
        "extract_meta": {
            "paper_id": paper_id,
            "question_pdf": str(files.question_pdf),
            "answer_pdf": str(files.answer_pdf or ""),
            "audio_file": str(files.audio_file or ""),
            "section_text_lengths": {key: len(value) for key, value in sections_text.items()},
            "warnings": warnings,
            "generated_at": now,
        },
    }


def make_section(section_id: str, exam_id: str, section_type: str, name: str, order: int, score: int, limit: int, now: str) -> dict[str, Any]:
    return {
        "_id": oid(section_id),
        "exam_id": oid(exam_id),
        "section_type": section_type,
        "section_name": name,
        "order_index": order,
        "total_score": score,
        "time_limit": limit,
        "created_at": date(now),
        "updated_at": date(now),
    }


def parse_reading(text: str, section_id: str, paper_id: str, answer_map: dict[int, dict[str, Any]], config: dict[str, Any], now: str):
    if not text.strip():
        return [], []
    first_question = re.search(question_start_regex(), text)
    passage_text = text[: first_question.start()].strip() if first_question else text[:2000].strip()
    question_text = text[first_question.start():].strip() if first_question else ""
    passage_id = object_id(paper_id, "passage-1")
    passage = make_passage(passage_id, section_id, passage_text, now)
    questions = parse_objective_questions(question_text, section_id, paper_id, "R", answer_map, config, now, passage_id=passage_id)
    for question in questions:
        question["passage_id"] = oid(passage_id)
        question["passage_ref"] = {"passage_id": oid(passage_id), "paragraph_ids": [], "evidence_text": ""}
    return [passage], questions


def make_passage(passage_id: str, section_id: str, text: str, now: str) -> dict[str, Any]:
    passage_text = text.strip() or "Reading passage extraction failed. Please review the source PDF and fill this passage manually."
    return {
        "_id": oid(passage_id),
        "section_id": oid(section_id),
        "title": "Reading Passage 1",
        "order_index": 1,
        "passage_text": passage_text,
        "paragraph_markers": build_paragraph_markers(passage_text),
        "created_at": date(now),
        "updated_at": date(now),
    }


def parse_objective_questions(
    text: str,
    section_id: str,
    paper_id: str,
    prefix: str,
    answer_map: dict[int, dict[str, Any]],
    config: dict[str, Any],
    now: str,
    audio_id: str | None = None,
    passage_id: str | None = None,
) -> list[dict[str, Any]]:
    questions = []
    for order_index, (question_no, chunk) in enumerate(split_question_chunks(text), start=1):
        options = parse_options(chunk)
        question_text = remove_options(chunk).strip()
        answer_info = answer_map.get(question_no, {})
        qtype = "multiple_choice" if isinstance(answer_info.get("correct_answer"), list) else "single_choice"
        questions.append(
            make_question(
                qid=object_id(paper_id, f"{prefix}-{question_no}"),
                section_id=section_id,
                order_index=order_index,
                qtype=qtype,
                question_text=question_text or f"Question {question_no}",
                options=mark_correct_options(options, answer_info.get("correct_answer")),
                correct_answer=answer_info.get("correct_answer"),
                explanation=answer_info.get("explanation", ""),
                difficulty=3,
                score=config["default_scores"].get(qtype, 2.5),
                now=now,
                audio_id=audio_id,
                passage_id=passage_id,
                source_question_no=f"{prefix}{question_no}",
                confidence=answer_info.get("confidence", 0.4),
            )
        )
    return questions


def split_question_chunks(text: str) -> list[tuple[int, str]]:
    matches = list(re.finditer(question_start_regex(), text))
    chunks = []
    for index, match in enumerate(matches):
        number = int(match.group(2))
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chunks.append((number, text[start:end].strip()))
    return chunks


def question_start_regex() -> re.Pattern[str]:
    return re.compile(r"(?m)(^|\n)\s*(\d{1,2})\s*[.、)]\s+")


def parse_options(chunk: str) -> list[dict[str, Any]]:
    pattern = re.compile(r"(?s)([A-D])\s*[.、)]\s*(.*?)(?=(?:\s+[A-D]\s*[.、)]|\n\s*[A-D]\s*[.、)]|\Z))", re.I)
    options = []
    seen = set()
    for key, value in pattern.findall(chunk):
        key = key.upper()
        if key in seen:
            continue
        seen.add(key)
        options.append({"key": key, "text": clean_inline(value), "is_correct": False})
    return options


def remove_options(chunk: str) -> str:
    return re.sub(r"(?s)([A-D])\s*[.、)]\s*.*?(?=(?:\s+[A-D]\s*[.、)]|\n\s*[A-D]\s*[.、)]|\Z))", "", chunk).strip()


def parse_subjective_sections(sections_text: dict[str, str], section_ids: dict[str, str], paper_id: str, config: dict[str, Any], now: str) -> list[dict[str, Any]]:
    questions = []
    for section_type, prefix, score_key in [("translation", "T", "subjective_translation"), ("writing", "W", "subjective_writing")]:
        text = sections_text.get(section_type, "").strip()
        if not text:
            continue
        questions.append(
            make_question(
                qid=object_id(paper_id, f"{prefix}-1"),
                section_id=section_ids[section_type],
                order_index=1,
                qtype="subjective",
                question_text=text,
                options=[],
                correct_answer={"reference": "", "rubric": []},
                explanation="",
                difficulty=3,
                score=config["default_scores"][score_key],
                now=now,
                source_question_no=f"{prefix}1",
                confidence=0.45,
            )
        )
    return questions


def placeholder_question(
    paper_id: str,
    section_id: str,
    section_type: str,
    order_index: int,
    now: str,
    qtype: str = "single_choice",
    audio_id: str | None = None,
    passage_id: str | None = None,
) -> dict[str, Any]:
    return make_question(
        qid=object_id(paper_id, f"placeholder-{section_type}-{order_index}"),
        section_id=section_id,
        order_index=order_index,
        qtype=qtype,
        question_text=f"{section_type.title()} extraction placeholder. Please review source PDF and fill this item manually.",
        options=[],
        correct_answer={"reference": "", "rubric": []} if qtype == "subjective" else None,
        explanation="Generated as placeholder because automatic PDF parsing did not find this section.",
        difficulty=3,
        score=15 if qtype == "subjective" else 0,
        now=now,
        audio_id=audio_id,
        passage_id=passage_id,
        source_question_no=f"{section_type[:1].upper()}P{order_index}",
        confidence=0.1,
    )


def make_question(
    qid: str,
    section_id: str,
    order_index: int,
    qtype: str,
    question_text: str,
    options: list[dict[str, Any]],
    correct_answer: Any,
    explanation: str,
    difficulty: int,
    score: float,
    now: str,
    source_question_no: str,
    confidence: float,
    audio_id: str | None = None,
    passage_id: str | None = None,
) -> dict[str, Any]:
    return {
        "_id": oid(qid),
        "section_id": oid(section_id),
        "passage_id": oid(passage_id) if passage_id else None,
        "audio_file_id": oid(audio_id) if audio_id else None,
        "question_type": qtype,
        "order_index": order_index,
        "question_text": {"raw": clean_inline(question_text), "html": ""},
        "options": options,
        "correct_answer": correct_answer,
        "explanation": {"raw": explanation, "html": ""},
        "audio_start_time": None,
        "audio_end_time": None,
        "transcript": "",
        "passage_ref": {"passage_id": oid(passage_id) if passage_id else None, "paragraph_ids": [], "evidence_text": ""},
        "tags": [],
        "difficulty": difficulty,
        "score": score,
        "import_meta": {"source_question_no": source_question_no, "confidence": confidence, "needs_review": confidence < 0.9},
        "created_at": date(now),
        "updated_at": date(now),
    }


def mark_correct_options(options: list[dict[str, Any]], answer: Any) -> list[dict[str, Any]]:
    answers = set(answer if isinstance(answer, list) else [answer] if answer else [])
    return [{**option, "is_correct": option["key"] in answers} for option in options]


def build_paragraph_markers(text: str) -> list[dict[str, Any]]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paragraphs) <= 1:
        paragraphs = [p.strip() for p in text.splitlines() if p.strip()]
    markers = []
    cursor = 0
    for index, paragraph in enumerate(paragraphs or [text[:120]], start=1):
        start = text.find(paragraph, cursor)
        end = start + len(paragraph) if start >= 0 else None
        cursor = end or cursor
        markers.append({"paragraph_id": f"P{index}", "order_index": index, "start_offset": start if start >= 0 else None, "end_offset": end, "text_preview": paragraph[:80]})
    return markers


def summarize_extract_result(result: dict[str, Any]) -> dict[str, Any]:
    return {key: result.get(key) for key in ["method", "page_count", "elapsed_seconds", "errors"]}


def clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def object_id(seed: str, label: str) -> str:
    return hashlib.md5(f"{seed}:{label}".encode("utf-8")).hexdigest()[:24]


def oid(value: str | None) -> dict[str, str] | None:
    return {"$oid": value} if value else None


def date(value: str) -> dict[str, str]:
    return {"$date": value}


if __name__ == "__main__":
    main()
