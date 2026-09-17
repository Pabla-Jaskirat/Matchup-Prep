"""Apply numbered SQL migrations in filename order, exactly once each.

Each file runs inside its own transaction: a failure rolls back and leaves no
record, so a fixed migration re-runs cleanly.
"""

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

MIGRATIONS = Path(__file__).resolve().parents[2] / "db" / "migrations"

TRACKING = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""


def main() -> None:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        sys.exit(f"No migrations found in {MIGRATIONS}")

    conn = db.connect()
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(TRACKING)
        cur.execute("SELECT version, checksum FROM schema_migrations")
        applied = dict(cur.fetchall())

    count = 0
    for path in files:
        sql = path.read_text()
        checksum = hashlib.sha256(sql.encode()).hexdigest()[:16]

        if path.name in applied:
            if applied[path.name] != checksum:
                sys.exit(f"{path.name} changed after being applied. "
                         "Write a new migration instead of editing this one.")
            print(f"  skip   {path.name}")
            continue

        conn.autocommit = False
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO schema_migrations (version, checksum) VALUES (%s, %s)",
                    (path.name, checksum),
                )
            conn.commit()
        except Exception as exc:
            conn.rollback()
            sys.exit(f"  FAILED {path.name}\n{exc}")
        finally:
            conn.autocommit = True

        print(f"  apply  {path.name}")
        count += 1

    conn.close()
    print(f"\n{count} applied, {len(files) - count} already present.")


if __name__ == "__main__":
    main()
