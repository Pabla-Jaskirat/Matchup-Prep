"""Sanity checks on the loaded data. Run after any refresh."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

CHECKS = [
    ("pitches loaded",        "SELECT count(*) FROM pitches", lambda v: v > 500_000),
    ("players named",         "SELECT count(*) FROM players", lambda v: v > 2_000),
    ("null stand/p_throws",   "SELECT count(*) FROM pitches "
                              "WHERE stand IS NULL OR p_throws IS NULL", lambda v: v == 0),
    ("distinct game dates",   "SELECT count(DISTINCT game_date) FROM pitches",
                              lambda v: v > 150),
    ("pct null pitch_type",   "SELECT round(100.0*count(*) FILTER "
                              "(WHERE pitch_type IS NULL)/count(*), 2) FROM pitches",
                              lambda v: v < 2),
    ("pct untracked zone",    "SELECT round(100.0*count(*) FILTER "
                              "(WHERE in_zone IS NULL)/count(*), 2) FROM pitches",
                              lambda v: v < 5),
    ("orphan pitcher ids",    "SELECT count(*) FROM (SELECT DISTINCT pitcher_id FROM "
                              "pitches) p LEFT JOIN players pl ON pl.mlbam_id = "
                              "p.pitcher_id WHERE pl.mlbam_id IS NULL", lambda v: v == 0),
]

if __name__ == "__main__":
    failed = 0
    with db.connect() as conn, conn.cursor() as cur:
        for label, sql, ok in CHECKS:
            cur.execute(sql)
            value = cur.fetchone()[0]
            passed = ok(value)
            failed += not passed
            print(f"  {'PASS' if passed else 'FAIL'}  {label:<22} {value:,}"
                  if isinstance(value, int) else
                  f"  {'PASS' if passed else 'FAIL'}  {label:<22} {value}")
    sys.exit(1 if failed else 0)
