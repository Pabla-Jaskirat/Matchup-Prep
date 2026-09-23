"""Check the aggregation SQL against an independent Python implementation.

The SQL in aggregate.py counts 684,000 rows in the database. This pulls the
raw pitches for a few real hitters back out, re-counts them with
reference_stats(), and compares every field. Two implementations written
separately agreeing on real data is much stronger evidence than either one
passing its own tests.

Read-only. Run it after any change to the aggregation.
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db
from aggregate import reference_stats

FIELDS = ["pitches_seen", "swings", "whiffs", "out_of_zone", "chases",
          "batted_balls", "whiff_rate", "chase_rate", "avg_est_woba",
          "avg_exit_velo"]

RAW = """
SELECT p.stand, a.shape_id, p.is_swing, p.is_whiff, p.in_zone, p.is_bip,
       p.est_woba, p.launch_speed  -- numeric, not float: same arithmetic as the SQL
FROM pitches p
JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE a.method = %(method)s AND p.season = %(season)s AND p.batter_id = %(batter)s
"""

STORED = f"""
SELECT stand, shape_id, {', '.join(FIELDS)}
FROM hitter_shape_stats
WHERE method = %(method)s AND season = %(season)s AND batter_id = %(batter)s
"""

POOL = """
SELECT mlbam_id, full_name FROM players
WHERE team = 'TOR' AND position <> 'P' ORDER BY full_name
"""


def as_float(v):
    return None if v is None else float(v)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default=db.DEFAULT_METHOD)
    args = ap.parse_args()

    conn = db.connect()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(POOL)
    pool = cur.fetchall()

    mismatches = 0
    for batter_id, name in pool:
        params = {"season": args.season, "method": args.method, "batter": batter_id}

        cur.execute(RAW, params)
        pitches = [{"stand": r[0], "shape_id": r[1], "is_swing": r[2],
                    "is_whiff": r[3], "in_zone": r[4], "is_bip": r[5],
                    "est_woba": r[6], "launch_speed": r[7]}
                   for r in cur.fetchall()]
        expected = reference_stats(pitches)

        cur.execute(STORED, params)
        stored = {(r[0], r[1]): dict(zip(FIELDS, (as_float(v) for v in r[2:])))
                  for r in cur.fetchall()}

        bad = []
        if set(stored) != set(expected):
            bad.append(f"row keys differ: {set(stored) ^ set(expected)}")
        for key in set(stored) & set(expected):
            for f in FIELDS:
                if stored[key][f] != expected[key][f]:
                    bad.append(f"{key} {f}: sql={stored[key][f]} "
                               f"python={expected[key][f]}")

        mismatches += len(bad)
        flag = "ok " if not bad else "BAD"
        print(f"  {flag} {name:<24} {len(pitches):>5,} pitches, "
              f"{len(stored):>2} shape rows")
        for line in bad[:5]:
            print(f"        {line}")

    conn.close()
    print(f"\n{len(pool)} hitters compared field by field, {mismatches} mismatches")
    sys.exit(1 if mismatches else 0)


if __name__ == "__main__":
    main()
