"""Freeze the numbers the how-it-works page tells its story with.

The page is server-rendered and must not query `pitches` -- that is the claim
the whole aggregate design exists to support, and an explainer that broke it
while explaining it would be a poor advertisement. So the facts are measured
once, here, and written to a JSON file the page imports.

Same pattern as db/shapes/v1_type_velo.json: a decision, or in this case a
measurement, stored as data and reviewable in a diff.

Read-only. Re-run after any change to the shape definitions.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db
from analyze_shapes import MIN_GROUP_PITCHES, PITCH_NAMES
from choose_bands import MIN_BAND_PITCHES, THREE_BANDS_ABOVE_IQR

MIN_CELL_PITCHES = 50
ARSENAL_FLOOR_PCT = 3.0
OUT = Path(__file__).resolve().parents[2] / "web" / "data" / "explainer.json"

# The example is the argument in one line: a hitter everyone has heard of,
# against a pitcher everyone has heard of, with a sample too small to use.
HITTER, PITCHER = 665489, 694973   # Guerrero Jr., Skenes


SUFFIXES = {"Jr.", "Sr.", "II", "III", "IV"}


def surname(full_name: str) -> str:
    """The name a coach would say out loud. "Vladimir Guerrero Jr." is
    "Guerrero" -- naive last-token splitting gives "Jr." and naive first-token
    gives "Vladimir", and both read as a mistake on the page."""
    parts = [p for p in full_name.split() if p not in SUFFIXES]
    return parts[-1] if parts else full_name


def facts(cur, season: int, method: str) -> dict:
    cur.execute("SELECT full_name FROM players WHERE mlbam_id = %s", (HITTER,))
    hitter_name = cur.fetchone()[0]
    cur.execute("SELECT full_name, throws FROM players WHERE mlbam_id = %s", (PITCHER,))
    pitcher_name, pitcher_hand = cur.fetchone()

    cur.execute("""SELECT count(*) FROM pitches WHERE season=%s
                   AND batter_id=%s AND pitcher_id=%s""", (season, HITTER, PITCHER))
    head_to_head = cur.fetchone()[0]

    cur.execute("""SELECT round(avg(n), 1), max(n), count(*) FROM (
                     SELECT count(*) n FROM pitches WHERE season=%s AND batter_id=%s
                     GROUP BY pitcher_id) x""", (season, HITTER))
    avg_per_pitcher, max_per_pitcher, pitchers_faced = cur.fetchone()

    # The same pitches, re-counted by shape instead of by who threw them.
    cur.execute("""
      SELECT a.shape_id, s.label, count(*) AS from_him,
             coalesce(h.pitches_seen, 0) AS from_everyone
      FROM pitches p
      JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
      JOIN pitch_shapes s ON s.method = a.method AND s.shape_id = a.shape_id
      LEFT JOIN hitter_shape_stats h ON h.method = a.method AND h.season = p.season
           AND h.batter_id = p.batter_id AND h.stand = p.stand
           AND h.shape_id = a.shape_id
      WHERE a.method=%s AND p.season=%s AND p.batter_id=%s AND p.pitcher_id=%s
      GROUP BY 1, 2, 4 ORDER BY 3 DESC""",
                (method, season, HITTER, PITCHER))
    by_shape = [{"shape_id": s, "label": l, "from_him": a, "from_everyone": b}
                for s, l, a, b in cur.fetchall()]

    # Every (hand, type) that clears the group floor, with the spread that
    # decides whether speed splits it.
    cur.execute("""
      SELECT p_throws, pitch_type, count(*),
             (percentile_cont(0.75) WITHIN GROUP (ORDER BY release_speed)
            - percentile_cont(0.25) WITHIN GROUP (ORDER BY release_speed))::numeric(4,1)
      FROM pitches WHERE season=%s AND pitch_type IS NOT NULL
        AND release_speed IS NOT NULL
      GROUP BY 1,2 HAVING count(*) >= %s ORDER BY 4 DESC""",
                (season, MIN_GROUP_PITCHES))
    raw_groups = cur.fetchall()

    # How many shapes each group actually ended up with. A group can clear the
    # spread test and still come back with one band, because three bands of
    # its size would each fall under the band floor. RHP knuckle-curves are
    # exactly that case, and the page would be lying without this column.
    cur.execute("""SELECT p_throws, pitch_type, count(*) FROM pitch_shapes
                   WHERE method=%s GROUP BY 1,2""", (method,))
    band_count = {(h, t): n for h, t, n in cur.fetchall()}

    groups = [{"hand": h, "pitch_type": t, "name": PITCH_NAMES.get(t, t),
               "pitches": n, "iqr": float(i),
               "bands": band_count.get((h, t), 0)}
              for h, t, n, i in raw_groups]

    # The pitch types that never got a shape at all, biggest first. The page
    # names the largest of them, so it must not be a number typed by hand.
    cur.execute("""
      SELECT p_throws, pitch_type, count(*), count(DISTINCT pitcher_id)
      FROM pitches WHERE season=%s AND pitch_type IS NOT NULL
        AND release_speed IS NOT NULL
      GROUP BY 1,2 HAVING count(*) < %s ORDER BY 3 DESC LIMIT 5""",
                (season, MIN_GROUP_PITCHES))
    below_floor = [{"hand": h, "pitch_type": t, "name": PITCH_NAMES.get(t, t),
                    "pitches": n, "pitchers": pc} for h, t, n, pc in cur.fetchall()]

    cur.execute("""SELECT shape_id, label, league_pitches FROM pitch_shapes
                   WHERE method=%s ORDER BY league_pitches DESC""", (method,))
    shapes = [{"shape_id": s, "label": l, "pitches": n} for s, l, n in cur.fetchall()]

    cur.execute("""SELECT count(*) FROM pitches WHERE season=%s
                   AND pitch_type IS NOT NULL""", (season,))
    typed = cur.fetchone()[0]
    cur.execute("""SELECT count(*) FROM shape_assignments a JOIN pitches p
                   USING (game_pk, at_bat_number, pitch_number)
                   WHERE a.method=%s AND p.season=%s""", (method, season))
    assigned = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM pitches WHERE season=%s", (season,))
    total = cur.fetchone()[0]

    cur.execute("""SELECT count(*) FROM players WHERE team='TOR' AND position<>'P'""")
    pool = cur.fetchone()[0]

    return {
        "season": season,
        "method": method,
        "generated": date.today().isoformat(),
        "totals": {"pitches": total, "typed": typed, "assigned": assigned,
                   "assigned_pct": round(100.0 * assigned / typed, 1),
                   "shapes": len(shapes), "groups": len(groups), "hitters": pool},
        "floors": {"group_pitches": MIN_GROUP_PITCHES,
                   "band_pitches": MIN_BAND_PITCHES,
                   "iqr_for_bands": THREE_BANDS_ABOVE_IQR,
                   "cell_pitches": MIN_CELL_PITCHES,
                   "arsenal_pct": ARSENAL_FLOOR_PCT},
        "example": {"hitter": hitter_name, "hitter_short": surname(hitter_name),
                    "pitcher": pitcher_name, "pitcher_short": surname(pitcher_name),
                    "pitcher_hand": pitcher_hand, "head_to_head": head_to_head,
                    "pitchers_faced": pitchers_faced,
                    "avg_per_pitcher": float(avg_per_pitcher),
                    "max_per_pitcher": max_per_pitcher, "by_shape": by_shape},
        "groups": groups,
        "below_floor": below_floor,
        "shapes": shapes,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default="v1_type_velo")
    args = ap.parse_args()

    conn = db.connect()
    conn.autocommit = True
    with conn.cursor() as cur:
        doc = facts(cur, args.season, args.method)
    conn.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    t = doc["totals"]
    print(f"  {OUT.relative_to(Path(__file__).resolve().parents[2])}: "
          f"{t['groups']} groups, {t['shapes']} shapes, "
          f"{t['assigned']:,} assigned ({t['assigned_pct']}%)")
    e = doc["example"]
    print(f"  example: {e['hitter']} saw {e['head_to_head']} pitches from "
          f"{e['pitcher']}; biggest shape {e['by_shape'][0]['from_him']} -> "
          f"{e['by_shape'][0]['from_everyone']}")


if __name__ == "__main__":
    main()
