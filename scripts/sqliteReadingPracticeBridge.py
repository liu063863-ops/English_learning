import json
import sqlite3
import sys


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def loads(value, fallback=None):
    if value in (None, ""):
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def rich_text(value):
    parsed = loads(value, {})
    if isinstance(parsed, dict):
        return parsed.get("raw") or parsed.get("html") or ""
    return str(parsed or "")


def answer_value(value):
    parsed = loads(value, None)
    if isinstance(parsed, dict):
        return parsed.get("answer") or parsed.get("raw") or ""
    return parsed


def normalize_answer(value):
    if isinstance(value, list):
        return ",".join(sorted(str(item).strip().upper() for item in value if str(item).strip()))
    return str(value or "").strip().upper()


def display_no(order_index):
    return 25 + int(order_index or 1)


def theme_from_title(title):
    if " - " in title:
        return title.split(" - ", 1)[1].strip()
    return "综合"


def list_practice(conn, filters):
    where = ["s.section_type = 'reading'"]
    params = []
    if filters.get("level"):
        where.append("e.level = ?")
        params.append(filters["level"])
    if filters.get("year"):
        where.append("e.year = ?")
        params.append(filters["year"])
    if filters.get("theme"):
        where.append("p.title LIKE ?")
        params.append(f"%{filters['theme']}%")
    if filters.get("keyword"):
        where.append("(p.title LIKE ? OR p.passage_text LIKE ? OR e.title LIKE ?)")
        keyword = f"%{filters['keyword']}%"
        params.extend([keyword, keyword, keyword])
    limit = max(1, min(int(filters.get("limit") or 100), 300))
    rows = conn.execute(
        f"""
        SELECT e.id AS exam_id, e.title AS exam_title, e.level, e.year, e.month, e.set_num,
               s.id AS section_id, p.id AS passage_id, p.title AS passage_title,
               p.order_index AS passage_order, p.passage_text,
               COUNT(q.id) AS question_count, AVG(q.difficulty) AS avg_difficulty
        FROM exams e
        JOIN sections s ON s.exam_id = e.id AND s.section_type = 'reading'
        JOIN passages p ON p.section_id = s.id
        LEFT JOIN questions q ON q.section_id = s.id AND q.passage_id = p.id
        WHERE {" AND ".join(where)}
        GROUP BY p.id
        ORDER BY e.year DESC, e.month DESC, e.level, e.set_num, p.order_index
        LIMIT ?
        """,
        [*params, limit],
    ).fetchall()
    return {
        "ok": True,
        "data": [
            {
                "id": row["passage_id"],
                "passageId": row["passage_id"],
                "examId": row["exam_id"],
                "examTitle": row["exam_title"],
                "level": row["level"],
                "year": row["year"],
                "month": row["month"],
                "setNum": row["set_num"],
                "title": row["passage_title"],
                "theme": theme_from_title(row["passage_title"] or ""),
                "difficulty": round(row["avg_difficulty"] or 3, 1),
                "questionCount": row["question_count"],
                "preview": (row["passage_text"] or "")[:220],
            }
            for row in rows
        ],
    }


def detail(conn, passage_id, include_answers=False):
    passage = conn.execute(
        """
        SELECT e.id AS exam_id, e.title AS exam_title, e.level, e.year, e.month, e.set_num,
               s.id AS section_id, p.*
        FROM passages p
        JOIN sections s ON s.id = p.section_id
        JOIN exams e ON e.id = s.exam_id
        WHERE p.id = ?
        """,
        [passage_id],
    ).fetchone()
    if not passage:
        return {"ok": False, "error": "READING_PASSAGE_NOT_FOUND"}
    questions = []
    for row in conn.execute(
        """
        SELECT * FROM questions
        WHERE section_id = ? AND passage_id = ?
        ORDER BY order_index
        """,
        [passage["section_id"], passage_id],
    ):
        question = {
            "id": row["id"],
            "questionId": row["id"],
            "displayNo": display_no(row["order_index"]),
            "orderIndex": row["order_index"],
            "questionType": row["question_type"],
            "prompt": rich_text(row["question_text_json"]),
            "options": loads(row["options_json"], []),
            "difficulty": row["difficulty"],
            "tags": loads(row["tags_json"], []),
            "passageRef": loads(row["passage_ref_json"], {}),
        }
        if include_answers:
            question["correctAnswer"] = answer_value(row["correct_answer_json"])
            question["explanation"] = rich_text(row["explanation_json"])
        questions.append(question)
    return {
        "ok": True,
        "data": {
            "id": passage["id"],
            "passageId": passage["id"],
            "examId": passage["exam_id"],
            "examTitle": passage["exam_title"],
            "level": passage["level"],
            "year": passage["year"],
            "month": passage["month"],
            "setNum": passage["set_num"],
            "title": passage["title"],
            "theme": theme_from_title(passage["title"] or ""),
            "passageText": passage["passage_text"],
            "paragraphMarkers": loads(passage["paragraph_markers_json"], []),
            "questions": questions,
        },
    }


def submit(conn, passage_id, answers):
    data = detail(conn, passage_id, include_answers=True)
    if not data.get("ok"):
        return data
    questions = data["data"]["questions"]
    details = []
    correct = 0
    for question in questions:
        user_answer = answers.get(question["id"], answers.get(str(question["displayNo"]), ""))
        is_correct = normalize_answer(user_answer) == normalize_answer(question.get("correctAnswer"))
        correct += 1 if is_correct else 0
        details.append({
            "questionId": question["id"],
            "displayNo": question["displayNo"],
            "prompt": question["prompt"],
            "userAnswer": user_answer,
            "correctAnswer": question.get("correctAnswer"),
            "isCorrect": is_correct,
            "explanation": question.get("explanation") or "暂无解析。",
        })
    return {
        "ok": True,
        "data": {
            "passageId": passage_id,
            "total": len(questions),
            "correct": correct,
            "accuracy": round((correct / len(questions)) * 100) if questions else 0,
            "details": details,
            "wrongQuestions": [item for item in details if not item["isCorrect"]],
        },
    }


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    conn = connect(payload["dbPath"])
    try:
        op = payload.get("op")
        if op == "list":
            result = list_practice(conn, payload.get("filters") or {})
        elif op == "detail":
            result = detail(conn, payload["passageId"])
        elif op == "submit":
            result = submit(conn, payload["passageId"], payload.get("answers") or {})
        else:
            result = {"ok": False, "error": f"Unknown op: {op}"}
        print(json.dumps(result, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
