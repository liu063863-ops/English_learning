import json
import sqlite3
import sys


TRANSLATION_TOPICS = {
    "CET4": [
        "中国高校越来越重视学生的实践能力。许多大学鼓励学生参加社会实践、志愿服务和创新项目。这些经历不仅能帮助学生理解课堂知识，也能提高他们解决实际问题的能力。",
        "近年来，越来越多的年轻人选择绿色出行。骑自行车、乘坐公共交通和步行不仅能减少空气污染，也有助于保持健康。城市也在不断改善公共交通服务。",
        "图书馆是大学校园中最重要的学习场所之一。除了借阅图书，学生还可以在图书馆参加讲座、使用电子资源，并与同学一起完成研究项目。"
    ],
    "CET6": [
        "随着数字技术的发展，在线学习已经成为高等教育的重要组成部分。它为学生提供了更加灵活的学习方式，但也要求学生具备更强的自律能力和信息筛选能力。",
        "人口老龄化正在影响许多国家的经济和社会结构。为了应对这一趋势，社会需要改善养老服务，鼓励终身学习，并创造更加包容的工作环境。",
        "科学研究不仅需要先进的设备，也需要开放的交流和严谨的态度。大学应鼓励学生提出问题、验证证据，并尊重不同的学术观点。"
    ],
    "default": [
        "教育的发展离不开社会、学校和个人的共同努力。良好的学习习惯、丰富的实践机会以及持续的自我反思，都能帮助学生更好地成长。",
        "环境保护已经成为现代社会的重要议题。每个人都可以通过节约能源、减少浪费和选择低碳生活方式，为可持续发展作出贡献。",
        "文化交流能够帮助人们理解不同的生活方式和价值观。通过学习外语、阅读文学作品和参与国际交流，学生可以拓宽视野。"
    ],
}

WRITING_TOPICS = {
    "CET4": [
        "Directions: For this part, you are allowed 30 minutes to write an essay on the importance of developing good study habits. You should write at least 120 words but no more than 180 words.",
        "Directions: For this part, you are allowed 30 minutes to write an essay on whether college students should take part in volunteer work. You should write at least 120 words but no more than 180 words.",
        "Directions: For this part, you are allowed 30 minutes to write an essay on how to make better use of campus libraries. You should write at least 120 words but no more than 180 words."
    ],
    "CET6": [
        "Directions: For this part, you are allowed 30 minutes to write an essay on the role of self-discipline in online learning. You should write at least 150 words but no more than 200 words.",
        "Directions: For this part, you are allowed 30 minutes to write an essay on the influence of artificial intelligence on college learning. You should write at least 150 words but no more than 200 words.",
        "Directions: For this part, you are allowed 30 minutes to write an essay on why critical thinking matters in higher education. You should write at least 150 words but no more than 200 words."
    ],
    "default": [
        "Directions: Write an essay on the importance of reviewing mistakes in English learning. You should support your view with reasons and examples.",
        "Directions: Write an essay on how students can balance exam preparation and long-term language ability.",
        "Directions: Write an essay on the value of reading in English learning."
    ],
}


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


def answer_text(value):
    parsed = loads(value, {})
    if isinstance(parsed, dict):
        return parsed.get("reference") or parsed.get("raw") or ""
    return str(parsed or "")


def is_placeholder(text):
    lower = (text or "").lower()
    return "placeholder" in lower or "pdf parsing is pending" in lower or "minimal import" in lower


def generated_prompt(section_type, level, index):
    topics = TRANSLATION_TOPICS if section_type == "translation" else WRITING_TOPICS
    pool = topics.get(level) or topics["default"]
    return pool[index % len(pool)]


def generated_reference(section_type, level, index):
    if section_type == "translation":
        return (
            "Reference translation: Chinese universities are paying increasing attention to students' practical abilities. "
            "Many universities encourage students to take part in social practice, volunteer services and innovation projects. "
            "These experiences help students understand classroom knowledge and improve their ability to solve real problems."
        )
    return (
        "Sample essay: A steady study routine plays an important role in English learning. "
        "First, it helps students review vocabulary and grammar regularly. Second, it gives learners enough time to correct mistakes. "
        "Finally, it reduces anxiety before exams because progress is made day by day. Therefore, students should build a realistic plan and follow it consistently."
    )


def list_items(conn, section_type, filters):
    where = ["s.section_type = ?"]
    params = [section_type]
    if filters.get("level"):
        where.append("e.level = ?")
        params.append(filters["level"])
    if filters.get("year"):
        where.append("e.year = ?")
        params.append(filters["year"])
    limit = max(1, min(int(filters.get("limit") or 100), 200))
    rows = conn.execute(
        f"""
        SELECT e.id AS exam_id, e.title AS exam_title, e.level, e.year, e.month, e.set_num,
               s.id AS section_id, s.section_name, q.id AS question_id, q.order_index,
               q.question_text_json, q.correct_answer_json, q.explanation_json, q.difficulty
        FROM exams e
        JOIN sections s ON s.exam_id=e.id
        JOIN questions q ON q.section_id=s.id
        WHERE {" AND ".join(where)}
        ORDER BY e.year DESC, e.month DESC, e.level, e.set_num
        LIMIT ?
        """,
        [*params, limit],
    ).fetchall()
    return {"ok": True, "data": [public_item(row, section_type, idx) for idx, row in enumerate(rows)]}


def public_item(row, section_type, idx):
    prompt = rich_text(row["question_text_json"])
    reference = answer_text(row["correct_answer_json"])
    explanation = rich_text(row["explanation_json"])
    if is_placeholder(prompt):
        prompt = generated_prompt(section_type, row["level"], idx)
    if not reference or is_placeholder(reference):
        reference = generated_reference(section_type, row["level"], idx)
    if not explanation or is_placeholder(explanation):
        explanation = "本题为结构化练习题。请先完成表达，再对照参考答案检查信息完整性、语法准确性和表达自然度。"
    base = {
        "id": row["question_id"],
        "questionId": row["question_id"],
        "examId": row["exam_id"],
        "examTitle": row["exam_title"],
        "level": row["level"],
        "year": row["year"],
        "month": row["month"],
        "setNum": row["set_num"],
        "difficulty": row["difficulty"],
        "reference": reference,
        "explanation": explanation,
    }
    if section_type == "translation":
        base["sourceText"] = prompt
        base["hint"] = "建议先保证核心信息完整，再优化从句、非谓语和连接表达。"
    else:
        base["prompt"] = prompt
        base["tips"] = "建议先写出清晰结构：观点、理由、例子、总结。"
    return base


def submit_translation(draft):
    word_count = len([part for part in (draft or "").replace("\n", " ").split(" ") if part.strip()])
    return {
        "ok": True,
        "data": {
            "wordCount": word_count,
            "score": min(15, round(word_count / 8, 1)),
            "comment": "已保存翻译练习。当前为半自动评分：请对照参考译文检查信息完整、语法准确和表达自然。"
        },
    }


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    conn = connect(payload["dbPath"])
    try:
        op = payload.get("op")
        if op == "listTranslations":
            result = list_items(conn, "translation", payload.get("filters") or {})
        elif op == "listWritings":
            result = list_items(conn, "writing", payload.get("filters") or {})
        elif op == "submitTranslation":
            result = submit_translation(payload.get("draft") or "")
        elif op == "saveWriting":
            result = {"ok": True, "data": {"saved": True, "wordCount": len((payload.get("draft") or "").split())}}
        else:
            result = {"ok": False, "error": f"Unknown op: {op}"}
        print(json.dumps(result, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
