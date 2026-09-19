"""Assign every pitch to its shape (Task 12, second half).

One INSERT ... SELECT does the work: pitches joins pitch_shapes on hand, type,
and a half-open velocity range. Doing it in the database rather than in Python
keeps 684,000 rows off the wire, and has a useful safety property -- if two
bands of one group ever overlapped, a single pitch would match twice and
Postgres would refuse the statement outright rather than quietly keeping
whichever row arrived last.

Re-running is safe: the natural key matches pitches, so a second run updates
rows in place.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

MIN_COVERAGE = 97.0

ASSIGN = """
INSERT INTO shape_assignments (method, game_pk, at_bat_number, pitch_number, shape_id)
SELECT s.method, p.game_pk, p.at_bat_number, p.pitch_number, s.shape_id
FROM pitches p
JOIN pitch_shapes s
  ON  s.method     = %(method)s
  AND s.p_throws   = p.p_throws
  AND s.pitch_type = p.pitch_type
  AND (s.velo_min IS NULL OR p.release_speed >= s.velo_min)
  AND (s.velo_max IS NULL OR p.release_speed <  s.velo_max)
WHERE p.season = %(season)s
  AND p.pitch_type    IS NOT NULL
  AND p.release_speed IS NOT NULL
ON CONFLICT (method, game_pk, at_bat_number, pitch_number)
DO UPDATE SET shape_id = EXCLUDED.shape_id
"""

TYPED = """
SELECT count(*) FROM pitches
WHERE season = %(season)s
  AND pitch_type IS NOT NULL AND release_speed IS NOT NULL
"""

UNASSIGNED = """
SELECT p.p_throws, p.pitch_type, count(*)
FROM pitches p
LEFT JOIN shape_assignments a
  ON  a.method        = %(method)s
  AND a.game_pk       = p.game_pk
  AND a.at_bat_number = p.at_bat_number
  AND a.pitch_number  = p.pitch_number
WHERE p.season = %(season)s
  AND p.pitch_type IS NOT NULL AND p.release_speed IS NOT NULL
  AND a.shape_id IS NULL
GROUP BY 1, 2
"""


def coverage_pct(assigned: int, typed: int) -> float:
    return round(assigned / typed * 100, 1) if typed else 0.0


def explain_unassigned(counts: dict[tuple[str, str], int],
                       known: set[tuple[str, str]]) -> list[str]:
    """One line per unassigned group, alarming ones first.

    A group with no shapes was never banded -- too rare to clear the
    5,000-pitch floor -- and its pitches are meant to be left out. A group
    that HAS shapes and still has unassigned pitches means the bands do not
    cover the number line, which is a bug.
    """
    lines = []
    for (hand, ptype), n in counts.items():
        unexpected = (hand, ptype) in known
        reason = ("UNEXPECTED: this group has shapes, so the bands have a gap"
                  if unexpected
                  else "no shape (group under the 5,000-pitch floor)")
        lines.append((not unexpected, -n, f"  {hand} {ptype:<2}{n:>7,}  {reason}"))
    return [line for _, _, line in sorted(lines)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default="v1_type_velo")
    args = ap.parse_args()
    params = {"season": args.season, "method": args.method}

    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT count(*) FROM pitch_shapes WHERE method = %(method)s", params)
    if cur.fetchone()[0] == 0:
        sys.exit(f"No shapes loaded for {args.method}. Run derive_shapes.py first.")

    cur.execute(ASSIGN, params)
    assigned_now = cur.rowcount
    conn.commit()

    cur.execute(TYPED, params)
    typed = cur.fetchone()[0]
    cur.execute("""SELECT count(*) FROM shape_assignments a
                   JOIN pitches p USING (game_pk, at_bat_number, pitch_number)
                   WHERE a.method = %(method)s AND p.season = %(season)s""", params)
    assigned = cur.fetchone()[0]

    pct = coverage_pct(assigned, typed)
    print(f"{assigned_now:,} rows written\n"
          f"{assigned:,}/{typed:,} typed pitches assigned ({pct}%)")

    cur.execute("SELECT p_throws, pitch_type FROM pitch_shapes WHERE method = %(method)s",
                params)
    known = {(h, t) for h, t in cur.fetchall()}
    cur.execute(UNASSIGNED, params)
    leftover = {(h, t): n for h, t, n in cur.fetchall()}
    if leftover:
        print("\nunassigned:")
        print("\n".join(explain_unassigned(leftover, known)))

    conn.close()
    if pct < MIN_COVERAGE:
        sys.exit(f"\nCoverage {pct}% is below the {MIN_COVERAGE}% floor.")


if __name__ == "__main__":
    main()
