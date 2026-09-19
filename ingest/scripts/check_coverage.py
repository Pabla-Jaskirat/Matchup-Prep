"""Thin-cell audit: how much of the page is actually filled in (Task 15).

The 75-pitch rule means a hitter-shape cell with too few pitches prints "not
enough data" instead of a number. That is honest, but a page of it is useless.
This measures how often it happens against real starters' arsenals, which is
the only version of the question that matters -- a coach never sees all 33
shapes at once, he sees the four or five tonight's starter throws.

The lever, if the answer is bad, is wider bands -- not more data. A second
season is ruled out on storage. Widening means editing
db/shapes/v1_type_velo.json and re-running Tasks 12 and 14, which is exactly
why the bands live in a file.

Read-only.
"""

import argparse
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

MIN_PITCHES = 75        # a hitter cell must clear this to show a number
ARSENAL_FLOOR_PCT = 3.0  # a shape must be this share of a pitcher's pitches
ENOUGH_SHAPES = 4.0      # PLAN.md's bar for the page being worth opening

POOL = """
SELECT mlbam_id, full_name FROM players
WHERE team = 'TOR' AND position <> 'P' ORDER BY full_name
"""

CELLS = """
SELECT batter_id, stand, shape_id, pitches_seen
FROM hitter_shape_stats WHERE method = %(method)s AND season = %(season)s
"""

# Starters, by the crude definition that survives: pitchers who have thrown a
# lot. Arsenal shares come from what they actually threw.
STARTERS = """
SELECT p.pitcher_id, pl.full_name, pl.throws, count(*) AS pitches
FROM pitches p JOIN players pl ON pl.mlbam_id = p.pitcher_id
WHERE p.season = %(season)s
GROUP BY 1, 2, 3 HAVING count(*) >= 1500
ORDER BY 4 DESC
"""

ARSENALS = """
SELECT p.pitcher_id, a.shape_id, count(*)
FROM pitches p JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE a.method = %(method)s AND p.season = %(season)s
GROUP BY 1, 2
"""


def arsenal(shape_counts: dict[str, int], floor_pct: float) -> list[str]:
    """The shapes a pitcher throws often enough to plan for, most-used first.

    A share rather than a fixed count: 3% of a reliever's 300 pitches is 9 and
    3% of a starter's 3,000 is 90, and an absolute floor would treat those two
    completely differently.
    """
    total = sum(shape_counts.values())
    if not total:
        return []
    return sorted((s for s, n in shape_counts.items()
                   if n / total * 100 >= floor_pct),
                  key=lambda s: -shape_counts[s])


def usable(cells: dict[str, int], shapes: list[str], threshold: int) -> int:
    """How many of tonight's shapes this hitter has enough history against."""
    return sum(1 for s in shapes if cells.get(s, 0) >= threshold)


def stand_for_hand(by_stand: dict[str, dict[str, int]], hand: str):
    """Which side this hitter bats from against a pitcher of `hand`.

    A shape id carries the pitcher's hand ("R-SL-1"), so the side a hitter
    used against righties is simply the side where his righty-shape pitches
    are. For most hitters there is only one side. For a switch-hitter the two
    sides barely overlap, and picking the wrong one reports someone who has
    seen almost nothing.
    """
    totals = {stand: sum(n for shape, n in cells.items()
                         if shape.startswith(f"{hand}-"))
              for stand, cells in by_stand.items()}
    best = max(totals, key=lambda s: totals[s], default=None)
    return best if best is not None and totals[best] else None


def median(values):
    return statistics.median(values) if values else None


def verdict(typical_usable: float) -> bool:
    return typical_usable >= ENOUGH_SHAPES


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default="v1_type_velo")
    ap.add_argument("--threshold", type=int, default=MIN_PITCHES)
    args = ap.parse_args()
    params = {"season": args.season, "method": args.method}

    conn = db.connect()
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute(POOL)
    pool = cur.fetchall()
    names = dict(pool)

    cur.execute(CELLS, params)
    by_hitter = defaultdict(lambda: defaultdict(dict))   # batter -> stand -> shape
    for batter, stand, shape, n in cur.fetchall():
        by_hitter[batter][stand][shape] = n

    cur.execute(STARTERS, params)
    starters = cur.fetchall()
    cur.execute(ARSENALS, params)
    pitcher_shapes = defaultdict(dict)
    for pid, shape, n in cur.fetchall():
        pitcher_shapes[pid][shape] = n
    conn.close()

    # --- part 1: all 33 shapes, ignoring who is pitching ---------------------
    jays = {b: v for b, v in by_hitter.items() if b in names}
    rows = [cells for sides in jays.values() for cells in sides.values()]
    total_cells = sum(len(c) for c in rows)
    thick = sum(1 for c in rows for n in c.values() if n >= args.threshold)
    print(f"Blue Jays hitter pool: {len(names)} hitters, "
          f"{len(rows)} (hitter, side) rows\n")
    print(f"  cells total            {total_cells:,}")
    print(f"  cells >= {args.threshold} pitches     {thick:,} "
          f"({thick / total_cells * 100:.0f}%)")

    per_row = sorted(sum(1 for n in c.values() if n >= args.threshold) for c in rows)
    print(f"  usable shapes, of 33   median {median(per_row)}, "
          f"range {per_row[0]}-{per_row[-1]}\n")

    # --- part 2: the real case, against real starters ------------------------
    print(f"Against the {len(starters)} pitchers with 1,500+ pitches "
          f"(arsenal floor {ARSENAL_FLOOR_PCT}% of their pitches):\n")

    arsenal_sizes, matchup_usable = [], []
    per_hitter_usable = defaultdict(list)
    for pid, pname, throws, _ in starters:
        shapes = arsenal(pitcher_shapes[pid], ARSENAL_FLOOR_PCT)
        arsenal_sizes.append(len(shapes))
        for batter, sides in jays.items():
            stand = stand_for_hand(sides, throws)
            if stand is None:      # never batted against this hand
                continue
            n = usable(sides[stand], shapes, args.threshold)
            matchup_usable.append(n)
            per_hitter_usable[batter].append(n)

    print(f"  arsenal size           median {median(arsenal_sizes)} shapes, "
          f"range {min(arsenal_sizes)}-{max(arsenal_sizes)}")
    typical = median(matchup_usable)
    print(f"  usable in a matchup    median {typical}, "
          f"mean {statistics.mean(matchup_usable):.1f}\n")

    print("  per hitter (median usable shapes across every starter):")
    for batter, values in sorted(per_hitter_usable.items(),
                                 key=lambda kv: -median(kv[1])):
        m = median(values)
        bar = "#" * int(m)
        print(f"    {names[batter]:<24} {m:>4}  {bar}")

    ok = verdict(typical)
    print(f"\n  bar: a typical hitter needs >= {ENOUGH_SHAPES} usable shapes "
          f"to make the page worth opening")
    print(f"  VERDICT: {'PASS' if ok else 'FAIL'} — typical matchup shows "
          f"{typical} of a median {median(arsenal_sizes)}-shape arsenal")
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
