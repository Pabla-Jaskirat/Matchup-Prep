"""Recompute the stats tables from pitches + shape_assignments (Task 14).

The work is done in SQL: 684,000 rows should not cross the wire to be counted.
But SQL that is subtly wrong still returns plausible numbers, and the two
mistakes that matter here both do. So the same definitions also exist as
reference_stats() below, which the tests pin down and verify_aggregate.py runs
against real hitters to confirm the SQL agrees.

The two mistakes:

  * The chase denominator is `count(*) FILTER (WHERE in_zone IS FALSE)`, never
    `count(*) - count(in_zone)`. in_zone is NULL for ~0.41% of pitches -- the
    tracking missed them, which is not the same as the pitch being a ball.
    Treating unknown as out-of-zone inflates the denominator and quietly
    deflates every chase rate on the page.

  * `stand` is part of the group-by. A switch-hitter is two rows: his numbers
    batting left and batting right are different numbers, and which one applies
    tonight is decided by the opposing starter's hand.

A run fully replaces one (method, season) slice -- delete, then insert -- so
re-running is exact rather than approximately idempotent.
"""

import argparse
import sys
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

# Shared by the hitter, league and zone inserts: pitches of one method and
# season, each already carrying its shape.
SOURCE = """
FROM pitches p
JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE a.method = %(method)s AND p.season = %(season)s
"""

# count(*) FILTER (...) rather than sum(CASE ...) so a NULL condition is simply
# not counted, which is the behaviour the chase denominator depends on.
COUNTS = """
    count(*),
    count(*) FILTER (WHERE p.is_swing),
    count(*) FILTER (WHERE p.is_whiff),
    count(*) FILTER (WHERE p.in_zone IS FALSE),
    count(*) FILTER (WHERE p.in_zone IS FALSE AND p.is_swing),
    count(*) FILTER (WHERE p.is_bip),
    round(count(*) FILTER (WHERE p.is_whiff)::numeric
          / NULLIF(count(*) FILTER (WHERE p.is_swing), 0), 4),
    round(count(*) FILTER (WHERE p.in_zone IS FALSE AND p.is_swing)::numeric
          / NULLIF(count(*) FILTER (WHERE p.in_zone IS FALSE), 0), 4)
"""

HITTER = f"""
INSERT INTO hitter_shape_stats
    (method, season, batter_id, stand, shape_id,
     pitches_seen, swings, whiffs, out_of_zone, chases, batted_balls,
     whiff_rate, chase_rate, avg_est_woba, avg_exit_velo)
SELECT %(method)s, p.season, p.batter_id, p.stand, a.shape_id,
{COUNTS},
    round(avg(p.est_woba), 4),
    round(avg(p.launch_speed), 1)
{SOURCE}
GROUP BY p.season, p.batter_id, p.stand, a.shape_id
"""

LEAGUE = f"""
INSERT INTO league_shape_stats
    (method, season, stand, shape_id,
     pitches_seen, swings, whiffs, out_of_zone, chases, batted_balls,
     whiff_rate, chase_rate, avg_est_woba)
SELECT %(method)s, p.season, p.stand, a.shape_id,
{COUNTS},
    round(avg(p.est_woba), 4)
{SOURCE}
GROUP BY p.season, p.stand, a.shape_id
"""

# Restricted to the Blue Jays hitter pool. League-wide this would be ~300,000
# rows for a view that is optional and first to cut; these are the only rows
# that can ever reach a screen.
ZONE = f"""
INSERT INTO hitter_shape_zone_stats
    (method, season, batter_id, stand, shape_id, zone,
     pitches_seen, swings, whiffs)
SELECT %(method)s, p.season, p.batter_id, p.stand, a.shape_id, p.zone,
    count(*),
    count(*) FILTER (WHERE p.is_swing),
    count(*) FILTER (WHERE p.is_whiff)
{SOURCE}
  AND p.zone IS NOT NULL
  AND p.batter_id IN (SELECT mlbam_id FROM players
                      WHERE team = 'TOR' AND position <> 'P')
GROUP BY p.season, p.batter_id, p.stand, a.shape_id, p.zone
"""

# The arsenal side: what each pitcher actually throws.
#
# It cannot reuse SOURCE -- SOURCE ends in a WHERE clause, and this needs a
# third join for the season total.
#
# season_pitches is every pitch he threw in the season, shaped or not, because
# the arsenal floor is a share and the honest denominator is the real workload.
PITCHER = """
INSERT INTO pitcher_shape_stats
    (method, season, pitcher_id, shape_id, pitches, season_pitches)
SELECT %(method)s, p.season, p.pitcher_id, a.shape_id,
       count(*), max(t.season_pitches)
FROM pitches p
JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
JOIN (SELECT pitcher_id, count(*) AS season_pitches
      FROM pitches WHERE season = %(season)s GROUP BY 1) t
  ON t.pitcher_id = p.pitcher_id
WHERE a.method = %(method)s AND p.season = %(season)s
GROUP BY p.season, p.pitcher_id, a.shape_id
"""

TABLES = [("hitter_shape_stats", HITTER),
          ("pitcher_shape_stats", PITCHER),
          ("league_shape_stats", LEAGUE),
          ("hitter_shape_zone_stats", ZONE)]


def _dec(v) -> Decimal:
    return Decimal(str(v))


def _rate(numerator, denominator: int, places: int = 4):
    """None when there is no denominator -- which is not the same as 0.0.

    A hitter who never swung has no whiff rate; printing 0% would read as
    "he never misses".

    Decimal, and ROUND_HALF_UP, to match the database rather than Python.
    Postgres rounds a half away from zero; Python's round() rounds it to the
    nearest even digit, so 73.05 becomes 73.1 in SQL and 73.0 here. On real
    data that disagreed on 42 of 447 hitter-shape rows -- all of them by one
    unit in the last place, which is exactly the kind of difference that looks
    like noise and is actually two implementations disagreeing.
    """
    if not denominator:
        return None
    step = Decimal(1).scaleb(-places)
    return float((_dec(numerator) / _dec(denominator))
                 .quantize(step, rounding=ROUND_HALF_UP))


def reference_stats(pitches) -> dict:
    """The same aggregation as the SQL above, in Python, over a list of dicts.

    Used by the tests and by verify_aggregate.py. Never used in the pipeline --
    its value is being a second opinion, so it must stay independent.
    """
    groups = defaultdict(list)
    for p in pitches:
        groups[(p["stand"], p["shape_id"])].append(p)

    out = {}
    for key, rows in groups.items():
        swings = sum(1 for p in rows if p["is_swing"])
        whiffs = sum(1 for p in rows if p["is_whiff"])
        out_of_zone = sum(1 for p in rows if p["in_zone"] is False)
        chases = sum(1 for p in rows if p["in_zone"] is False and p["is_swing"])
        wobas = [_dec(p["est_woba"]) for p in rows if p["est_woba"] is not None]
        velos = [_dec(p["launch_speed"]) for p in rows
                 if p["launch_speed"] is not None]
        out[key] = {
            "pitches_seen": len(rows),
            "swings": swings,
            "whiffs": whiffs,
            "out_of_zone": out_of_zone,
            "chases": chases,
            "batted_balls": sum(1 for p in rows if p["is_bip"]),
            "whiff_rate": _rate(whiffs, swings),
            "chase_rate": _rate(chases, out_of_zone),
            "avg_est_woba": _rate(sum(wobas, Decimal(0)), len(wobas)),
            "avg_exit_velo": _rate(sum(velos, Decimal(0)), len(velos), 1),
        }
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default="v1_type_velo")
    args = ap.parse_args()
    params = {"season": args.season, "method": args.method}

    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()

    for table, insert in TABLES:
        cur.execute(f"DELETE FROM {table} WHERE method = %(method)s "
                    f"AND season = %(season)s", params)
        removed = cur.rowcount
        cur.execute(insert, params)
        print(f"  {table:<24} {cur.rowcount:>7,} rows"
              + (f"  (replaced {removed:,})" if removed else ""))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
