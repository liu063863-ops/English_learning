import csv
import json
import sqlite3
import sys
from pathlib import Path


DEFAULT_BOOKS = [
    ("四级核心词汇", "CET4", "覆盖大学英语四级高频基础词，适合每日新词和复习。"),
    ("六级核心词汇", "CET6", "覆盖大学英语六级阅读、听力和写作高频词。"),
    ("考研必考词", "考研", "覆盖考研英语阅读、翻译和写作核心词。"),
]

DEFAULT_WORDS = {
    "CET4": [
        ("efficient", "/ɪˈfɪʃnt/", "高效的；有效率的", "An efficient plan saves time during exam preparation.", 2, 18),
        ("approach", "/əˈprəʊtʃ/", "方法；接近；处理", "A balanced approach combines vocabulary and reading practice.", 2, 21),
        ("available", "/əˈveɪləbl/", "可获得的；有空的", "More practice materials are available online.", 1, 16),
        ("benefit", "/ˈbenɪfɪt/", "益处；使受益", "Regular review benefits long-term memory.", 1, 20),
        ("challenge", "/ˈtʃælɪndʒ/", "挑战；质疑", "Listening speed is a common challenge for CET4 students.", 2, 17),
        ("environment", "/ɪnˈvaɪrənmənt/", "环境；周围状况", "A quiet environment helps students concentrate.", 2, 15),
        ("improve", "/ɪmˈpruːv/", "提高；改善", "Mistake review can improve test performance.", 1, 19),
        ("necessary", "/ˈnesəsəri/", "必要的", "Daily practice is necessary for vocabulary growth.", 1, 18),
        ("opportunity", "/ˌɒpəˈtjuːnəti/", "机会", "College gives students opportunities to use English.", 2, 14),
        ("require", "/rɪˈkwaɪə(r)/", "需要；要求", "Translation tasks require accurate grammar.", 1, 20),
    ],
    "CET6": [
        ("substantial", "/səbˈstænʃl/", "大量的；实质性的", "Substantial progress comes from repeated practice.", 3, 16),
        ("interpret", "/ɪnˈtɜːprɪt/", "解释；理解；口译", "Students need to interpret the author's attitude.", 3, 18),
        ("integrate", "/ˈɪntɪɡreɪt/", "整合；融合", "The system integrates vocabulary and mock exams.", 3, 14),
        ("potential", "/pəˈtenʃl/", "潜在的；潜力", "Review records reveal potential weaknesses.", 3, 17),
        ("essential", "/ɪˈsenʃl/", "必要的；本质的", "Evidence is essential in academic writing.", 2, 21),
        ("evaluate", "/ɪˈvæljueɪt/", "评估；评价", "The report evaluates students' learning progress.", 3, 13),
        ("significant", "/sɪɡˈnɪfɪkənt/", "重要的；显著的", "A significant change appeared in the results.", 3, 20),
        ("assumption", "/əˈsʌmpʃn/", "假设；设想", "The argument depends on a hidden assumption.", 3, 12),
        ("consequence", "/ˈkɒnsɪkwəns/", "结果；后果", "Every choice has a consequence.", 3, 11),
        ("maintain", "/meɪnˈteɪn/", "保持；维护；主张", "Learners should maintain a steady review rhythm.", 2, 16),
    ],
    "考研": [
        ("ambiguous", "/æmˈbɪɡjuəs/", "模糊的；有歧义的", "The author's attitude is deliberately ambiguous.", 4, 18),
        ("derive", "/dɪˈraɪv/", "源于；获得；推导", "Many academic terms derive from Latin.", 3, 16),
        ("hypothesis", "/haɪˈpɒθəsɪs/", "假设；假说", "The study tested a clear hypothesis.", 4, 13),
        ("phenomenon", "/fəˈnɒmɪnən/", "现象", "The passage explains a social phenomenon.", 4, 15),
        ("criterion", "/kraɪˈtɪəriən/", "标准；准则", "Accuracy is one criterion for translation scoring.", 4, 12),
        ("inherent", "/ɪnˈhɪərənt/", "固有的；内在的", "There are inherent limits in the method.", 4, 11),
        ("empirical", "/ɪmˈpɪrɪkl/", "经验主义的；实证的", "The conclusion is based on empirical evidence.", 5, 10),
        ("subtle", "/ˈsʌtl/", "微妙的；不易察觉的", "A subtle difference may change the answer.", 4, 17),
        ("whereas", "/ˌweərˈæz/", "然而；鉴于", "Some learners prefer speed, whereas others value accuracy.", 3, 19),
        ("notion", "/ˈnəʊʃn/", "概念；看法", "The notion appears several times in the passage.", 3, 15),
    ],
}


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            phonetic TEXT,
            meaning TEXT NOT NULL,
            example TEXT,
            category TEXT NOT NULL CHECK (category IN ('CET4','CET6','考研')),
            difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
            frequency INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(word, category)
        );

        CREATE TABLE IF NOT EXISTS word_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('CET4','CET6','考研')),
            description TEXT,
            word_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, category)
        );

        CREATE TABLE IF NOT EXISTS word_book_items (
            word_book_id INTEGER NOT NULL,
            word_id INTEGER NOT NULL,
            PRIMARY KEY (word_book_id, word_id),
            FOREIGN KEY (word_book_id) REFERENCES word_books(id) ON DELETE CASCADE,
            FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS word_review_progress (
            word_id INTEGER PRIMARY KEY,
            familiarity INTEGER DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            wrong_count INTEGER DEFAULT 0,
            last_reviewed_at TIMESTAMP,
            next_review_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
        CREATE INDEX IF NOT EXISTS idx_words_frequency ON words(category, frequency DESC);
        CREATE INDEX IF NOT EXISTS idx_words_difficulty ON words(category, difficulty);
        CREATE INDEX IF NOT EXISTS idx_word_books_category ON word_books(category);
        CREATE INDEX IF NOT EXISTS idx_word_review_due ON word_review_progress(next_review_at);
        """
    )


def seed_if_empty(conn):
    if scalar(conn, "SELECT COUNT(*) FROM word_books") == 0:
        for name, category, description in DEFAULT_BOOKS:
            conn.execute(
                "INSERT OR IGNORE INTO word_books (name, category, description) VALUES (?, ?, ?)",
                [name, category, description],
            )
    if scalar(conn, "SELECT COUNT(*) FROM words") == 0:
        for category, rows in DEFAULT_WORDS.items():
            book_id = scalar(conn, "SELECT id FROM word_books WHERE category = ? ORDER BY id LIMIT 1", [category])
            for word, phonetic, meaning, example, difficulty, frequency in rows:
                word_id = upsert_word(conn, {
                    "word": word,
                    "phonetic": phonetic,
                    "meaning": meaning,
                    "example": example,
                    "category": category,
                    "difficulty": difficulty,
                    "frequency": frequency,
                })
                conn.execute("INSERT OR IGNORE INTO word_book_items (word_book_id, word_id) VALUES (?, ?)", [book_id, word_id])
    refresh_counts(conn)


def refresh_counts(conn):
    for row in conn.execute("SELECT id FROM word_books"):
        count = scalar(conn, "SELECT COUNT(*) FROM word_book_items WHERE word_book_id = ?", [row["id"]])
        conn.execute("UPDATE word_books SET word_count = ? WHERE id = ?", [count, row["id"]])


def list_books(conn):
    rows = [dict(row) for row in conn.execute("SELECT * FROM word_books ORDER BY category, id")]
    return {"ok": True, "data": rows}


def list_words(conn, payload):
    filters = payload.get("filters") or {}
    where = []
    params = []
    if filters.get("category"):
        where.append("w.category = ?")
        params.append(filters["category"])
    if filters.get("bookId"):
        where.append("w.id IN (SELECT word_id FROM word_book_items WHERE word_book_id = ?)")
        params.append(filters["bookId"])
    if filters.get("keyword"):
        where.append("(w.word LIKE ? OR w.meaning LIKE ?)")
        keyword = f"%{filters['keyword']}%"
        params.extend([keyword, keyword])
    limit = max(1, min(int(filters.get("limit") or 50), 500))
    sql = f"""
      SELECT w.*, COALESCE(p.familiarity, 0) AS familiarity,
             COALESCE(p.review_count, 0) AS reviewCount,
             COALESCE(p.correct_count, 0) AS correctCount,
             COALESCE(p.wrong_count, 0) AS wrongCount,
             p.last_reviewed_at AS lastReviewedAt,
             p.next_review_at AS nextReviewAt
      FROM words w
      LEFT JOIN word_review_progress p ON p.word_id = w.id
      {'WHERE ' + ' AND '.join(where) if where else ''}
      ORDER BY COALESCE(p.next_review_at, '1970-01-01') ASC, w.frequency DESC, w.id ASC
      LIMIT ?
    """
    rows = [public_word(row) for row in conn.execute(sql, [*params, limit])]
    return {"ok": True, "data": rows}


def review_word(conn, payload):
    word_id = int(payload["wordId"])
    familiarity = int(payload.get("familiarity", 0))
    familiarity = max(0, min(3, familiarity))
    correct = 1 if familiarity >= 2 else 0
    wrong = 1 if familiarity < 2 else 0
    interval_days = [0, 1, 3, 7][familiarity]
    conn.execute(
        """
        INSERT INTO word_review_progress (
          word_id, familiarity, review_count, correct_count, wrong_count,
          last_reviewed_at, next_review_at, updated_at
        )
        VALUES (?, ?, 1, ?, ?, CURRENT_TIMESTAMP, datetime('now', ? || ' days'), CURRENT_TIMESTAMP)
        ON CONFLICT(word_id) DO UPDATE SET
          familiarity = excluded.familiarity,
          review_count = word_review_progress.review_count + 1,
          correct_count = word_review_progress.correct_count + ?,
          wrong_count = word_review_progress.wrong_count + ?,
          last_reviewed_at = CURRENT_TIMESTAMP,
          next_review_at = excluded.next_review_at,
          updated_at = CURRENT_TIMESTAMP
        """,
        [word_id, familiarity, correct, wrong, interval_days, correct, wrong],
    )
    row = conn.execute(
        """
        SELECT w.*, p.familiarity, p.review_count AS reviewCount, p.correct_count AS correctCount,
               p.wrong_count AS wrongCount, p.last_reviewed_at AS lastReviewedAt, p.next_review_at AS nextReviewAt
        FROM words w LEFT JOIN word_review_progress p ON p.word_id = w.id
        WHERE w.id = ?
        """,
        [word_id],
    ).fetchone()
    return {"ok": True, "data": public_word(row)}


def import_words(conn, payload):
    book = payload.get("book") or {}
    words = payload.get("words") or []
    category = book.get("category") or payload.get("category")
    if category not in ("CET4", "CET6", "考研"):
        raise ValueError("category must be CET4, CET6 or 考研")
    name = book.get("name") or {"CET4": "四级核心词汇", "CET6": "六级核心词汇", "考研": "考研必考词"}[category]
    conn.execute(
        "INSERT OR IGNORE INTO word_books (name, category, description) VALUES (?, ?, ?)",
        [name, category, book.get("description") or ""],
    )
    book_id = scalar(conn, "SELECT id FROM word_books WHERE name = ? AND category = ?", [name, category])
    imported = 0
    for item in words:
        item = {**item, "category": item.get("category") or category}
        word_id = upsert_word(conn, item)
        conn.execute("INSERT OR IGNORE INTO word_book_items (word_book_id, word_id) VALUES (?, ?)", [book_id, word_id])
        imported += 1
    refresh_counts(conn)
    return {"ok": True, "bookId": book_id, "imported": imported}


def import_csv(conn, payload):
    csv_path = Path(payload["csvPath"])
    category = payload["category"]
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return import_words(conn, {"category": category, "book": payload.get("book") or {}, "words": rows})


def stats(conn):
    rows = [dict(row) for row in conn.execute("SELECT category, COUNT(*) AS count FROM words GROUP BY category")]
    reviewed = scalar(conn, "SELECT COUNT(*) FROM word_review_progress WHERE review_count > 0")
    return {"ok": True, "data": {"byCategory": rows, "reviewed": reviewed, "total": scalar(conn, "SELECT COUNT(*) FROM words")}}


def upsert_word(conn, item):
    conn.execute(
        """
        INSERT INTO words (word, phonetic, meaning, example, category, difficulty, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(word, category) DO UPDATE SET
          phonetic = COALESCE(NULLIF(excluded.phonetic, ''), words.phonetic),
          meaning = COALESCE(NULLIF(excluded.meaning, ''), words.meaning),
          example = COALESCE(NULLIF(excluded.example, ''), words.example),
          difficulty = COALESCE(excluded.difficulty, words.difficulty),
          frequency = MAX(words.frequency, excluded.frequency)
        """,
        [
            clean(item.get("word")),
            clean(item.get("phonetic")),
            clean(item.get("meaning")),
            clean(item.get("example")),
            item.get("category"),
            int(item.get("difficulty") or 1),
            int(item.get("frequency") or 0),
        ],
    )
    return scalar(conn, "SELECT id FROM words WHERE word = ? AND category = ?", [clean(item.get("word")), item.get("category")])


def public_word(row):
    item = dict(row)
    item["tags"] = item["category"]
    item["chinese"] = item["meaning"]
    item["wordBookId"] = item["category"]
    return item


def scalar(conn, sql, params=None):
    row = conn.execute(sql, params or []).fetchone()
    return None if row is None else row[0]


def clean(value):
    return str(value or "").strip()


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    db_path = payload["dbPath"]
    op = payload.get("op")
    conn = connect(db_path)
    try:
        with conn:
            ensure_schema(conn)
            seed_if_empty(conn)
            if op == "listBooks":
                result = list_books(conn)
            elif op == "listWords":
                result = list_words(conn, payload)
            elif op == "reviewWord":
                result = review_word(conn, payload)
            elif op == "importWords":
                result = import_words(conn, payload)
            elif op == "importCsv":
                result = import_csv(conn, payload)
            elif op == "stats":
                result = stats(conn)
            else:
                result = {"ok": False, "error": f"Unknown op: {op}"}
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
