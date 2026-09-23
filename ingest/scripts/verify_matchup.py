"""Check the matchup API against SQL run straight off `pitches` (Task 19).

The API reads only the aggregate tables. This re-derives the same numbers from
the raw pitch rows, so agreement means the aggregates, the arsenal floor, the
50-pitch rule, the stand selection for switch-hitters and the league
comparison all survived the trip to JSON.

Usage: make verify-matchup   (needs `make dev` running)
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

MIN_PITCHES = 50
ARSENAL_FLOOR_PCT = 3.0
LEAGUE_MARGIN = 0.05

ARSENAL = """
SELECT a.shape_id, count(*),
       (SELECT count(*) FROM pitches WHERE pitcher_id = %(pid)s AND season = %(season)s)
FROM pitches p JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE a.method = %(method)s AND p.season = %(season)s AND p.pitcher_id = %(pid)s
GROUP BY 1
"""

CELL = """
SELECT count(*),
       count(*) FILTER (WHERE p.is_swing),
       count(*) FILTER (WHERE p.is_whiff)
FROM pitches p JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE a.method = %(method)s AND p.season = %(season)s
  AND p.batter_id = %(bid)s AND p.stand = %(stand)s AND a.shape_id = %(shape)s
"""

LEAGUE_WHIFF = """
SELECT count(*) FILTER (WHERE p.is_whiff)::numeric
       / NULLIF(count(*) FILTER (WHERE p.is_swing), 0)
FROM pitches p JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE a.method = %(method)s AND p.season = %(season)s
  AND p.stand = %(stand)s AND a.shape_id = %(shape)s
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default=db.DEFAULT_METHOD)
    ap.add_argument("pitchers", nargs="*", type=int,
                    default=[592332, 669373, 650911])  # Gausman, Skubal, Sánchez
    args = ap.parse_args()

    conn = db.connect()
    conn.autocommit = True
    cur = conn.cursor()
    problems = 0
    checked = 0

    for pid in args.pitchers:
        with urllib.request.urlopen(f"{args.base}/api/matchup/{pid}") as r:
            page = json.load(r)
        print(f"\n{page['pitcher']['name']} ({page['pitcher']['throws']}HP)")

        base = {"method": args.method, "season": args.season, "pid": pid}
        cur.execute(ARSENAL, base)
        rows = cur.fetchall()
        season_pitches = rows[0][2]
        want = sorted((s for s, n, _ in rows
                       if n / season_pitches * 100 >= ARSENAL_FLOOR_PCT),
                      key=lambda s: -dict((x[0], x[1]) for x in rows)[s])
        got = [a["shape_id"] for a in page["arsenal"]]
        checked += 1
        if want != got:
            problems += 1
            print(f"  ARSENAL MISMATCH  sql={want}  api={got}")
        else:
            print(f"  arsenal ok: {got}")

        if season_pitches != page["pitcher"]["pitches"]:
            problems += 1
            print(f"  SEASON PITCHES MISMATCH {season_pitches} vs "
                  f"{page['pitcher']['pitches']}")

        for h in page["hitters"]:
            if h["stand"] is None:
                continue
            for shape in got:
                cell = h["cells"][shape]
                p = dict(base, bid=h["id"], stand=h["stand"], shape=shape)
                cur.execute(CELL, p)
                seen, swings, whiffs = cur.fetchone()
                checked += 1

                if seen < MIN_PITCHES:
                    if cell["kind"] != "insufficient" or cell["pitches_seen"] != seen:
                        problems += 1
                        print(f"  {h['name']} {shape}: sql {seen} pitches, api {cell}")
                    continue

                if cell["kind"] != "value":
                    problems += 1
                    print(f"  {h['name']} {shape}: sql {seen} pitches, api says "
                          f"insufficient")
                    continue

                rate = float(whiffs) / swings if swings else None
                if (cell["pitches_seen"], cell["swings"], cell["whiffs"]) != \
                        (seen, swings, whiffs):
                    problems += 1
                    print(f"  {h['name']} {shape}: counts sql "
                          f"{(seen, swings, whiffs)} api "
                          f"{(cell['pitches_seen'], cell['swings'], cell['whiffs'])}")
                if rate is not None and abs(rate - cell["whiff_rate"]) > 1e-4:
                    problems += 1
                    print(f"  {h['name']} {shape}: rate sql {rate:.4f} "
                          f"api {cell['whiff_rate']}")

                cur.execute(LEAGUE_WHIFF, p)
                lg = cur.fetchone()[0]
                if lg is not None and rate is not None:
                    delta = rate - float(lg)
                    expect = ("worse" if delta >= LEAGUE_MARGIN - 1e-9 else
                              "better" if delta <= -LEAGUE_MARGIN + 1e-9 else "typical")
                    if cell["verdict"] != expect:
                        problems += 1
                        print(f"  {h['name']} {shape}: verdict sql {expect} "
                              f"(delta {delta:+.4f}) api {cell['verdict']}")

    conn.close()
    print(f"\n{checked} assertions, {problems} problems")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
