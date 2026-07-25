import json
import sqlite3
import sys


PROGRESS_TABLES = [
    "word_review_progress",
    "exam_attempts",
    "exam_sessions",
    "study_progress",
    "wrong_questions",
]


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def table_exists(conn, table):
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table],
    ).fetchone()
    return row is not None


def table_columns(conn, table):
    return [row["name"] for row in conn.execute(f"PRAGMA table_info({quote_ident(table)})")]


def export_progress(conn):
    tables = {}
    for table in PROGRESS_TABLES:
        if not table_exists(conn, table):
            continue
        rows = [dict(row) for row in conn.execute(f"SELECT * FROM {quote_ident(table)}")]
        tables[table] = {
            "columns": table_columns(conn, table),
            "rows": rows,
        }
    return {"tables": tables}


def import_progress(conn, progress):
    tables = progress.get("tables") or {}
    imported = {}
    with conn:
        for table, payload in tables.items():
            if table not in PROGRESS_TABLES or not table_exists(conn, table):
                continue
            target_columns = set(table_columns(conn, table))
            rows = payload.get("rows") or []
            if not rows:
                continue
            conn.execute(f"DELETE FROM {quote_ident(table)}")
            count = 0
            for row in rows:
                columns = [column for column in row.keys() if column in target_columns]
                if not columns:
                    continue
                placeholders = ", ".join(["?"] * len(columns))
                sql = (
                    f"INSERT OR REPLACE INTO {quote_ident(table)} "
                    f"({', '.join(quote_ident(column) for column in columns)}) "
                    f"VALUES ({placeholders})"
                )
                conn.execute(sql, [row[column] for column in columns])
                count += 1
            imported[table] = count
    return {"imported": imported}


def quote_ident(value):
    return '"' + str(value).replace('"', '""') + '"'


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    conn = connect(payload["dbPath"])
    try:
        op = payload.get("op")
        if op == "export":
            data = export_progress(conn)
        elif op == "import":
            data = import_progress(conn, payload.get("progress") or {})
        else:
            raise ValueError(f"Unknown op: {op}")
        print(json.dumps({"ok": True, "data": data}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
