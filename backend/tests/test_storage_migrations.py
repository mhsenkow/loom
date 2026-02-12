import sqlite3
from pathlib import Path

from app.services import storage


def test_init_db_applies_migrations_idempotently(tmp_path: Path, monkeypatch):
    db_path = tmp_path / "loom.db"

    monkeypatch.setattr(storage, "_db_path", lambda: db_path)

    storage.init_db()
    storage.init_db()

    conn = sqlite3.connect(str(db_path))
    try:
        migrations = conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
        assert migrations == [(1,)]

        table_names = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "modules" in table_names
        assert "circuits" in table_names
        assert "sessions" in table_names
        assert "schema_migrations" in table_names
    finally:
        conn.close()
