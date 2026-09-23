"""Freeze the numbers the how-it-works page tells its story with.

The page is server-rendered and must not query `pitches` -- that is the claim
the whole aggregate design exists to support, and an explainer that broke it
while explaining it would be a poor advertisement. So the facts are measured
once, here, and written to a JSON file the page imports.

Same pattern as db/shapes/<method>.json: a decision, or in this case a
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
from choose_bands import SHAPES_DIR, SPLIT_ABOVE_IQR

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


# The rule that was measured and rejected. Its shape file stays in git, so the
# comparison below is driven by the real band edges rather than by numbers
# typed into the page.
REJECTED = "v1_type_velo"


def split_test(cur, season: int, method: str) -> dict | None:
    """What splitting on velocity would cost, measured against the same data.

    The claim on the page -- that the speed bands showed nothing to anyone --
    is a coverage claim, so it is counted rather than asserted. For every
    (hand, pitch_type) the old rule cut into bands, count the Blue Jays
    hitter cells that clear the 50-pitch display floor whole, and count them
    again sliced into those bands.

    Returns None if the old shape file is gone, which is the honest outcome:
    the page then has nothing to show rather than a stale number.
    """
    path = SHAPES_DIR / f"{REJECTED}.json"
    if not path.exists():
        return None
    old = json.loads(path.read_text())
    banded = [g for g in old["groups"] if len(g["bands"]) > 1]
    if not banded:
        return None

    groups = []
    for g in banded:
        # One row per (hitter, stand) with that hand+type, and the same
        # pitches bucketed by the old band edges.
        cases = " ".join(
            f"WHEN {'TRUE' if b['velo_min'] is None else f'release_speed >= {b_min}'}"
            f" AND {'TRUE' if b['velo_max'] is None else f'release_speed < {b_max}'}"
            f" THEN '{b['shape_id']}'"
            for b in g["bands"]
            for b_min, b_max in [(b["velo_min"], b["velo_max"])]
        )
        cur.execute(f"""
          WITH mine AS (
            SELECT p.batter_id, p.stand, p.release_speed,
                   CASE {cases} END AS band
            FROM pitches p
            JOIN players pl ON pl.mlbam_id = p.batter_id
            WHERE p.season = %s AND p.p_throws = %s AND p.pitch_type = %s
              AND p.release_speed IS NOT NULL
              AND pl.team = 'TOR' AND pl.position <> 'P'
          )
          SELECT
            (SELECT count(*) FROM (SELECT 1 FROM mine GROUP BY batter_id, stand
                                   HAVING count(*) >= %s) w),
            (SELECT count(*) FROM (SELECT 1 FROM mine GROUP BY batter_id, stand, band
                                   HAVING count(*) >= %s) b),
            (SELECT max(n) FROM (SELECT count(*) n FROM mine
                                 GROUP BY batter_id, stand, band) m)
        """, (season, g["p_throws"], g["pitch_type"], MIN_CELL_PITCHES,
              MIN_CELL_PITCHES))
        whole, split, best = cur.fetchone()
        groups.append({"hand": g["p_throws"], "pitch_type": g["pitch_type"],
                       "name": PITCH_NAMES.get(g["pitch_type"], g["pitch_type"]),
                       "bands": len(g["bands"]), "iqr": g["iqr"],
                       "cells_whole": whole, "cells_split": split,
                       "best_split_cell": best or 0})

    return {
        "rejected_method": REJECTED,
        "split_above_iqr": old["rule"].get("three_bands_above_iqr",
                                           old["rule"].get("split_above_iqr")),
        "shapes_then": old["shapes"],
        # A group could clear the spread test and still come back as one
        # shape, because three slices of it would each fall under this floor.
        # The page needs it to explain the widest bar on its own chart.
        "min_band_pitches": old["rule"]["min_band_pitches"],
        "groups": groups,
        "cells_whole": sum(g["cells_whole"] for g in groups),
        "cells_split": sum(g["cells_split"] for g in groups),
        "best_split_cell": max((g["best_split_cell"] for g in groups), default=0),
    }


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
                   "split_above_iqr": SPLIT_ABOVE_IQR,
                   "cell_pitches": MIN_CELL_PITCHES,
                   "arsenal_pct": ARSENAL_FLOOR_PCT},
        "split_test": split_test(cur, season, method),
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
    ap.add_argument("--method", default=db.DEFAULT_METHOD)
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
