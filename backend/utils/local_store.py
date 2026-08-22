import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from config import DATA_DIR, PROJECTS_DB_FILE, TESTCASES_DB_FILE, EXECUTIONS_DB_FILE, EXECUTION_LOGS_DB_FILE
from utils.logger import logger

DB_FILE = DATA_DIR / "qa_ai_local.db"
_LOCK = threading.RLock()

@contextmanager
def _connect():
    connection = sqlite3.connect(DB_FILE, timeout=30)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

def initialize():
    with _LOCK, _connect() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS records (
            kind TEXT NOT NULL, id TEXT NOT NULL, user_id TEXT, project_id TEXT,
            payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind, id))""")
        connection.execute("CREATE INDEX IF NOT EXISTS records_kind_user ON records(kind, user_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS records_kind_project ON records(kind, project_id)")
    _migrate_legacy_once()

def upsert(kind, record):
    record_id = str(record.get("id") or "")
    if not record_id:
        raise ValueError(f"{kind} record requires an id")
    with _LOCK, _connect() as connection:
        connection.execute("""INSERT INTO records(kind,id,user_id,project_id,payload,updated_at) VALUES(?,?,?,?,?,?)
            ON CONFLICT(kind,id) DO UPDATE SET user_id=excluded.user_id,
            project_id=excluded.project_id,payload=excluded.payload,updated_at=excluded.updated_at""",
            (kind, record_id, record.get("user_id"), record.get("project_id"), json.dumps(record), datetime.now(timezone.utc).isoformat()))
    return record

def get(kind, record_id):
    with _connect() as connection:
        row = connection.execute("SELECT payload FROM records WHERE kind=? AND id=?", (kind, str(record_id))).fetchone()
    return json.loads(row["payload"]) if row else None

def list_records(kind, user_id=None, project_id=None):
    sql, values = "SELECT payload FROM records WHERE kind=?", [kind]
    if user_id:
        sql += " AND user_id=?"; values.append(user_id)
    if project_id:
        sql += " AND project_id=?"; values.append(project_id)
    sql += " ORDER BY updated_at DESC"
    with _connect() as connection:
        rows = connection.execute(sql, values).fetchall()
    return [json.loads(row["payload"]) for row in rows]

def delete(kind, record_id):
    with _LOCK, _connect() as connection:
        cursor = connection.execute("DELETE FROM records WHERE kind=? AND id=?", (kind, str(record_id)))
    return cursor.rowcount > 0

def delete_project_tree(project_id):
    project_id = str(project_id)
    with _LOCK, _connect() as connection:
        execution_rows = connection.execute("SELECT id FROM records WHERE kind='execution' AND project_id=?", (project_id,)).fetchall()
        for row in execution_rows:
            connection.execute("DELETE FROM records WHERE kind='execution_logs' AND id=?", (row["id"],))
        connection.execute("DELETE FROM records WHERE project_id=?", (project_id,))
        connection.execute("DELETE FROM records WHERE kind='project' AND id=?", (project_id,))

def _migrate_legacy_once():
    marker = DATA_DIR / ".sqlite_migration_v1"
    if marker.exists(): return
    try:
        for file_path, kind in [(PROJECTS_DB_FILE, "project"), (TESTCASES_DB_FILE, "test_case"), (EXECUTIONS_DB_FILE, "execution")]:
            if file_path.exists():
                data = json.loads(file_path.read_text(encoding="utf-8"))
                for item in data if isinstance(data, list) else []:
                    if isinstance(item, dict) and item.get("id"): upsert(kind, item)
        if EXECUTION_LOGS_DB_FILE.exists():
            data = json.loads(EXECUTION_LOGS_DB_FILE.read_text(encoding="utf-8"))
            for execution_id, logs in data.items() if isinstance(data, dict) else []:
                upsert("execution_logs", {"id": execution_id, "logs": logs})
        marker.write_text("migrated", encoding="utf-8")
    except Exception as exc:
        logger.error(f"Legacy local-data migration failed: {exc}")

initialize()
