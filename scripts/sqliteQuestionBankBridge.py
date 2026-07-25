import json
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend" / "data" / "english_exam.db"
SCHEMA_PATH = ROOT / "docs" / "database" / "sqlite-question-bank.schema.sql"


def main():
    request = clean_surrogates(json.loads(sys.stdin.read() or "{}"))
    op = request.get("op")
    db_path = Path(request.get("dbPath") or DB_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conn.create_function("merge_json_if_empty", 2, merge_json_if_empty)
        conn.execute("PRAGMA foreign_keys = ON")
        init_schema(conn)

        if op == "init":
            result = {"ok": True, "dbPath": str(db_path)}
        elif op == "stats":
            result = stats(conn)
        elif op == "importPayload":
            result = import_payload(conn, request.get("payload") or {})
        elif op == "replacePayload":
            result = replace_payload(conn, request.get("payload") or {})
        elif op == "listExams":
            result = list_exams(conn, request.get("filters") or {})
        elif op == "getExamSection":
            result = get_exam_section(conn, request["examId"], request["sectionType"])
        elif op == "checkExpected":
            result = check_expected(conn, request.get("papers") or [])
        else:
            raise ValueError(f"Unknown op: {op}")

    print(json.dumps(result, ensure_ascii=False))


def init_schema(conn):
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def stats(conn):
    return {
        "ok": True,
        "database": "sqlite",
        "counts": {
            "exams": scalar(conn, "SELECT COUNT(*) FROM exams"),
            "sections": scalar(conn, "SELECT COUNT(*) FROM sections"),
            "audio_files": scalar(conn, "SELECT COUNT(*) FROM audio_files"),
            "passages": scalar(conn, "SELECT COUNT(*) FROM passages"),
            "questions": scalar(conn, "SELECT COUNT(*) FROM questions"),
        },
        "byYear": [dict(row) for row in conn.execute(
            "SELECT year, month, level, COUNT(*) AS count FROM exams GROUP BY year, month, level ORDER BY year DESC, month DESC, level"
        )],
        "bySectionType": [dict(row) for row in conn.execute(
            """
            SELECT s.section_type, COUNT(q.id) AS question_count
            FROM sections s
            LEFT JOIN questions q ON q.section_id = s.id
            GROUP BY s.section_type
            ORDER BY s.section_type
            """
        )],
    }


def import_payload(conn, payload):
    report = {
        "database": "sqlite",
        "insertedExams": 0,
        "updatedExams": 0,
        "insertedSections": 0,
        "insertedAudioFiles": 0,
        "insertedPassages": 0,
        "insertedQuestions": 0,
        "patchedQuestions": 0,
        "skippedExams": 0,
    }
    with conn:
        for exam in payload.get("exams", []):
            before = scalar(conn, "SELECT COUNT(*) FROM exams WHERE id = ?", [oid(exam.get("_id"))])
            upsert_exam(conn, exam)
            report["updatedExams" if before else "insertedExams"] += 1
        for section in payload.get("sections", []):
            report["insertedSections"] += upsert_section(conn, section)
        for audio in payload.get("audio_files", []):
            report["insertedAudioFiles"] += upsert_audio(conn, audio)
        for passage in payload.get("passages", []):
            report["insertedPassages"] += upsert_passage(conn, passage)
        for question in payload.get("questions", []):
            inserted, patched = upsert_question(conn, question)
            report["insertedQuestions"] += inserted
            report["patchedQuestions"] += patched
    return {"ok": True, "report": report}


def replace_payload(conn, payload):
    report = {
        "database": "sqlite",
        "replacedExams": 0,
        "removedSections": 0,
        "removedAudioFiles": 0,
        "removedPassages": 0,
        "removedQuestions": 0,
        "insertedExams": 0,
        "insertedSections": 0,
        "insertedAudioFiles": 0,
        "insertedPassages": 0,
        "insertedQuestions": 0,
        "patchedQuestions": 0,
    }
    with conn:
        for exam in payload.get("exams", []):
            existing = conn.execute(
                """
                SELECT id FROM exams
                WHERE level = ? AND year = ? AND month = ? AND set_num = ? AND source = ?
                """,
                [
                    exam.get("level"),
                    exam.get("year"),
                    exam.get("month"),
                    exam.get("set_num"),
                    exam.get("source") or "past_exam",
                ],
            ).fetchone()
            if existing:
                section_rows = conn.execute("SELECT id FROM sections WHERE exam_id = ?", [existing["id"]]).fetchall()
                section_ids = [row["id"] for row in section_rows]
                if section_ids:
                    placeholders = ",".join(["?"] * len(section_ids))
                    report["removedQuestions"] += scalar(conn, f"SELECT COUNT(*) FROM questions WHERE section_id IN ({placeholders})", section_ids)
                    report["removedPassages"] += scalar(conn, f"SELECT COUNT(*) FROM passages WHERE section_id IN ({placeholders})", section_ids)
                    conn.execute(f"DELETE FROM questions WHERE section_id IN ({placeholders})", section_ids)
                    conn.execute(f"DELETE FROM passages WHERE section_id IN ({placeholders})", section_ids)
                    conn.execute(f"DELETE FROM sections WHERE id IN ({placeholders})", section_ids)
                audio_count = scalar(conn, "SELECT COUNT(*) FROM audio_files WHERE exam_id = ?", [existing["id"]])
                report["removedAudioFiles"] += audio_count
                conn.execute("DELETE FROM audio_files WHERE exam_id = ?", [existing["id"]])
                report["replacedExams"] += 1
                report["removedSections"] += len(section_ids)
                conn.execute("DELETE FROM exams WHERE id = ?", [existing["id"]])
            upsert_exam(conn, exam)
            report["insertedExams"] += 1
        for section in payload.get("sections", []):
            report["insertedSections"] += upsert_section(conn, section)
        for audio in payload.get("audio_files", []):
            report["insertedAudioFiles"] += upsert_audio(conn, audio)
        for passage in payload.get("passages", []):
            report["insertedPassages"] += upsert_passage(conn, passage)
        for question in payload.get("questions", []):
            inserted, patched = upsert_question(conn, question)
            report["insertedQuestions"] += inserted
            report["patchedQuestions"] += patched
    return {"ok": True, "report": report}


def upsert_exam(conn, exam):
    conn.execute(
        """
        INSERT INTO exams (id, title, level, year, month, set_num, source, source_meta_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(level, year, month, set_num, source) DO UPDATE SET
          title = COALESCE(NULLIF(excluded.title, ''), exams.title),
          source_meta_json = merge_json_if_empty(exams.source_meta_json, excluded.source_meta_json),
          status = CASE WHEN exams.status = 'draft' THEN excluded.status ELSE exams.status END,
          updated_at = CURRENT_TIMESTAMP
        """,
        [
            oid(exam.get("_id")),
            exam.get("title") or "",
            exam.get("level"),
            exam.get("year"),
            exam.get("month"),
            exam.get("set_num"),
            exam.get("source") or "past_exam",
            dumps(exam.get("source_meta") or {}),
            exam.get("status") or "published",
            date_value(exam.get("created_at")),
        ],
    )


def upsert_section(conn, section):
    before = scalar(conn, "SELECT COUNT(*) FROM sections WHERE exam_id = ? AND section_type = ?", [oid(section.get("exam_id")), section.get("section_type")])
    conn.execute(
        """
        INSERT INTO sections (id, exam_id, section_type, section_name, order_index, total_score, time_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(exam_id, section_type) DO UPDATE SET
          section_name = COALESCE(NULLIF(excluded.section_name, ''), sections.section_name),
          total_score = COALESCE(excluded.total_score, sections.total_score),
          time_limit = COALESCE(excluded.time_limit, sections.time_limit),
          updated_at = CURRENT_TIMESTAMP
        """,
        [
            oid(section.get("_id")),
            oid(section.get("exam_id")),
            section.get("section_type"),
            section.get("section_name") or section.get("section_type"),
            section.get("order_index"),
            section.get("total_score") or 0,
            section.get("time_limit"),
            date_value(section.get("created_at")),
        ],
    )
    return 0 if before else 1


def upsert_audio(conn, audio):
    before = scalar(conn, "SELECT COUNT(*) FROM audio_files WHERE id = ?", [oid(audio.get("_id"))])
    conn.execute(
        """
        INSERT INTO audio_files (id, exam_id, section_id, file_url, duration, transcript_full, source_meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(exam_id, section_id, file_url) DO UPDATE SET
          duration = CASE WHEN audio_files.duration = 0 THEN excluded.duration ELSE audio_files.duration END,
          transcript_full = COALESCE(NULLIF(audio_files.transcript_full, ''), excluded.transcript_full),
          source_meta_json = merge_json_if_empty(audio_files.source_meta_json, excluded.source_meta_json),
          updated_at = CURRENT_TIMESTAMP
        """,
        [
            oid(audio.get("_id")),
            oid(audio.get("exam_id")),
            oid(audio.get("section_id")),
            audio.get("file_url") or "",
            audio.get("duration") or 0,
            audio.get("transcript_full") or "",
            dumps(audio.get("source_meta") or {}),
            date_value(audio.get("created_at")),
        ],
    )
    return 0 if before else 1


def upsert_passage(conn, passage):
    before = scalar(conn, "SELECT COUNT(*) FROM passages WHERE section_id = ? AND order_index = ?", [oid(passage.get("section_id")), passage.get("order_index")])
    conn.execute(
        """
        INSERT INTO passages (id, section_id, title, order_index, passage_text, paragraph_markers_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        ON CONFLICT(section_id, order_index) DO UPDATE SET
          title = COALESCE(NULLIF(excluded.title, ''), passages.title),
          passage_text = COALESCE(NULLIF(passages.passage_text, ''), excluded.passage_text),
          paragraph_markers_json = merge_json_if_empty(passages.paragraph_markers_json, excluded.paragraph_markers_json),
          updated_at = CURRENT_TIMESTAMP
        """,
        [
            oid(passage.get("_id")),
            oid(passage.get("section_id")),
            passage.get("title") or "",
            passage.get("order_index"),
            passage.get("passage_text") or "",
            dumps(passage.get("paragraph_markers") or []),
            date_value(passage.get("created_at")),
        ],
    )
    return 0 if before else 1


def upsert_question(conn, question):
    section_id = oid(question.get("section_id"))
    order_index = question.get("order_index")
    existing = conn.execute("SELECT * FROM questions WHERE section_id = ? AND order_index = ?", [section_id, order_index]).fetchone()
    if not existing:
        conn.execute(
            """
            INSERT INTO questions (
              id, section_id, passage_id, audio_file_id, question_type, order_index,
              question_text_json, options_json, correct_answer_json, explanation_json,
              audio_start_time, audio_end_time, transcript, passage_ref_json, tags_json,
              difficulty, score, import_meta_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
            """,
            question_params(question),
        )
        return 1, 0

    patch = {}
    if empty_json(existing["question_text_json"]) and question.get("question_text"):
        patch["question_text_json"] = dumps(question.get("question_text"))
    if empty_json(existing["options_json"]) and question.get("options"):
        patch["options_json"] = dumps(question.get("options"))
    if existing["correct_answer_json"] in (None, "", "null") and question.get("correct_answer") is not None:
        patch["correct_answer_json"] = dumps(question.get("correct_answer"))
    if empty_explanation(existing["explanation_json"]) and question.get("explanation", {}).get("raw"):
        patch["explanation_json"] = dumps(question.get("explanation"))
    if not existing["transcript"] and question.get("transcript"):
        patch["transcript"] = question.get("transcript")
    if patch:
        assignments = ", ".join([f"{key} = ?" for key in patch] + ["updated_at = CURRENT_TIMESTAMP"])
        conn.execute(f"UPDATE questions SET {assignments} WHERE id = ?", [*patch.values(), existing["id"]])
    return 0, 1 if patch else 0


def question_params(question):
    return [
        oid(question.get("_id")),
        oid(question.get("section_id")),
        oid(question.get("passage_id")),
        oid(question.get("audio_file_id")),
        "blank" if question.get("question_type") == "fill_blank" else question.get("question_type"),
        question.get("order_index"),
        dumps(question.get("question_text") or {}),
        dumps(question.get("options") or []),
        dumps(question.get("correct_answer")) if question.get("correct_answer") is not None else None,
        dumps(question.get("explanation") or {"raw": "", "html": ""}),
        question.get("audio_start_time"),
        question.get("audio_end_time"),
        question.get("transcript") or "",
        dumps(question.get("passage_ref") or {}),
        dumps(question.get("tags") or []),
        question.get("difficulty") or 3,
        question.get("score") or 0,
        dumps(question.get("import_meta") or {}),
        date_value(question.get("created_at")),
    ]


def list_exams(conn, filters):
    where = ["status = ?"]
    params = [filters.get("status") or "published"]
    if filters.get("level"):
        where.append("level = ?")
        params.append(filters["level"])
    if filters.get("year"):
        where.append("year = ?")
        params.append(filters["year"])
    if filters.get("month"):
        where.append("month = ?")
        params.append(filters["month"])
    if filters.get("set_num"):
        where.append("set_num = ?")
        params.append(filters["set_num"])
    if filters.get("yearMin"):
        where.append("year >= ?")
        params.append(filters["yearMin"])
    if filters.get("yearMax"):
        where.append("year <= ?")
        params.append(filters["yearMax"])
    if filters.get("keyword"):
        where.append("(title LIKE ? OR level LIKE ? OR CAST(year AS TEXT) LIKE ? OR CAST(month AS TEXT) LIKE ?)")
        keyword = f"%{filters['keyword']}%"
        params.extend([keyword, keyword, keyword, keyword])
    page = int(filters.get("page") or 1)
    page_size = int(filters.get("pageSize") or 20)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size
    total = scalar(conn, f"SELECT COUNT(*) FROM exams WHERE {' AND '.join(where)}", params)
    rows = conn.execute(
        f"""
        SELECT e.*,
               COUNT(q.id) AS questionCount,
               COALESCE(SUM(DISTINCT s.time_limit), 0) AS estimatedMinutes
        FROM exams e
        LEFT JOIN sections s ON s.exam_id = e.id
        LEFT JOIN questions q ON q.section_id = s.id
        WHERE {' AND '.join(where)}
        GROUP BY e.id
        ORDER BY e.year DESC, e.month DESC, e.level, e.set_num
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()
    return {"ok": True, "data": [exam_row(row) for row in rows], "pagination": {"page": page, "pageSize": page_size, "total": total, "totalPages": (total + page_size - 1) // page_size}}


def get_exam_section(conn, exam_id, section_type):
    exam = conn.execute("SELECT * FROM exams WHERE id = ?", [exam_id]).fetchone()
    section = conn.execute("SELECT * FROM sections WHERE exam_id = ? AND section_type = ?", [exam_id, section_type]).fetchone()
    if not exam or not section:
        return {"ok": False, "error": "EXAM_OR_SECTION_NOT_FOUND"}
    questions = [question_row(row, hide_answers=True) for row in conn.execute("SELECT * FROM questions WHERE section_id = ? ORDER BY order_index", [section["id"]])]
    passages = [passage_row(row) for row in conn.execute("SELECT * FROM passages WHERE section_id = ? ORDER BY order_index", [section["id"]])]
    audios = [audio_row(row) for row in conn.execute("SELECT * FROM audio_files WHERE section_id = ?", [section["id"]])]
    return {"ok": True, "data": {"exam": exam_row(exam), "section": dict(section), "questions": questions, "passages": passages, "audioFiles": audios}}


def check_expected(conn, papers):
    complete = [p for p in papers if p.get("completeness", {}).get("hasQuestion") and p.get("completeness", {}).get("hasAnswer") and p.get("completeness", {}).get("hasAudio")]
    existing = set(
        f"{row['level']}:{row['year']}:{row['month']}:{row['set_num']}:past_exam"
        for row in conn.execute("SELECT level, year, month, set_num FROM exams WHERE source = 'past_exam'")
    )
    expected = [f"{p.get('level') or p.get('examType')}:{p.get('year')}:{p.get('month')}:{p.get('set_num') or p.get('paperNo')}:past_exam" for p in complete]
    missing = [key for key in expected if key not in existing]
    return {"ok": len(missing) == 0, "expected": len(expected), "existing": len(existing), "missing": missing}


def exam_row(row):
    item = dict(row)
    item["_id"] = item.pop("id")
    item["source_meta"] = loads(item.pop("source_meta_json", "{}"))
    item["difficultyLabel"] = "中等"
    item["completedUsers"] = 0
    return item


def question_row(row, hide_answers=False):
    item = dict(row)
    item["_id"] = item.pop("id")
    item["question_text"] = loads(item.pop("question_text_json"))
    item["options"] = loads(item.pop("options_json"))
    item["correct_answer"] = loads(item.pop("correct_answer_json")) if item.get("correct_answer_json") else None
    item.pop("correct_answer_json", None)
    item["explanation"] = loads(item.pop("explanation_json"))
    item["passage_ref"] = loads(item.pop("passage_ref_json"))
    item["tags"] = loads(item.pop("tags_json"))
    item["import_meta"] = loads(item.pop("import_meta_json"))
    if hide_answers:
        item.pop("correct_answer", None)
        item.pop("explanation", None)
        item.pop("transcript", None)
    return item


def passage_row(row):
    item = dict(row)
    item["_id"] = item.pop("id")
    item["paragraph_markers"] = loads(item.pop("paragraph_markers_json"))
    return item


def audio_row(row):
    item = dict(row)
    item["_id"] = item.pop("id")
    item["source_meta"] = loads(item.pop("source_meta_json"))
    item.pop("transcript_full", None)
    return item


def scalar(conn, sql, params=None):
    return conn.execute(sql, params or []).fetchone()[0]


def oid(value):
    if isinstance(value, dict):
        return value.get("$oid")
    return value


def date_value(value):
    if isinstance(value, dict):
        return value.get("$date")
    return value


def dumps(value):
    return json.dumps(value, ensure_ascii=False)


def loads(value):
    if not value:
        return None
    return json.loads(value)


def empty_json(value):
    return value in (None, "", "[]", "{}")


def empty_explanation(value):
    try:
        parsed = json.loads(value or "{}")
        return not parsed.get("raw")
    except Exception:
        return True


def merge_json_if_empty(current, incoming):
    return incoming if empty_json(current) else current


def clean_surrogates(value):
    if isinstance(value, str):
        return value.encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, list):
        return [clean_surrogates(item) for item in value]
    if isinstance(value, dict):
        return {key: clean_surrogates(item) for key, item in value.items()}
    return value


if __name__ == "__main__":
    sqlite3.enable_callback_tracebacks(True)
    main()
