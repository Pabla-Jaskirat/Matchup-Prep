"""Does the shape say anything true? (evidence for the README)

Two questions this answers, both by measurement rather than argument.

1. Are these numbers repeatable? Every pitch is assigned to half A or half B
   by a hash of its natural key, and each hitter's whiff rate is computed twice
   from disjoint pitches. Agreement means the number measures the hitter.

   Batter-versus-pitcher cannot even be tested: the most swings any hitter took
   against any one pitcher all season is 34, so no pair has 25 in each half.
   That is the project's premise, as a number.

2. Does the SHAPE add anything, or is it just "this hitter whiffs a lot"?

If a hitter's whiff rate against every shape were simply his own overall rate
shifted by how hard that pitch is for everybody, the per-shape numbers would be
decoration: the page would only be telling a coach who the good hitters are,
which he already knows.

So strip both of those out. For each cell:

    expected = hitter's overall rate + (league rate on this shape
                                        - league rate overall)
    residual = actual - expected

The residual is what is left that is specific to THIS hitter against THIS
pitch. Then split-half it: compute the residual twice from disjoint pitches,
using baselines from within each half so nothing leaks, and correlate.

r near 0  -> the shape adds nothing; the tool is a hitter ranking.
r above 0 -> hitters really do have pitch-specific strengths, and the
             intersection with tonight's arsenal is real information.
"""
import argparse
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

MIN_SWINGS_PER_HALF = 25

SQL = """
SELECT p.batter_id, p.stand, {key} AS grp,
       (abs(hashtextextended(p.game_pk::text || '-' || p.at_bat_number::text
            || '-' || p.pitch_number::text, 42)) %% 2) AS half,  -- %% : literal modulo
       count(*) FILTER (WHERE p.is_swing) AS swings,
       count(*) FILTER (WHERE p.is_whiff) AS whiffs
FROM pitches p
JOIN shape_assignments a USING (game_pk, at_bat_number, pitch_number)
WHERE p.season = %(season)s AND a.method = %(method)s
GROUP BY 1, 2, 3, 4
"""

# Four ways of grouping the same pitches, coarse to fine. The point is to find
# where the signal stops improving, not to assume it keeps improving.
FAMILY = ("CASE WHEN a.shape_id ~ '-(FF|SI|FC)-' THEN 'fastball' "
          "WHEN a.shape_id ~ '-(SL|ST|CU|KC|SV)-' THEN 'breaking' "
          "ELSE 'offspeed' END")
TYPE_ONLY = "split_part(a.shape_id,'-',2)"
HAND_TYPE = "split_part(a.shape_id,'-',1) || '-' || split_part(a.shape_id,'-',2)"

KEYS = {
    "fastball/breaking/offspeed, with hand (6)":
        "split_part(a.shape_id,'-',1) || '-' || " + FAMILY,
    "pitch type only, hand ignored     (8)": TYPE_ONLY,
    "hand + type                      (16)": HAND_TYPE,
    "hand + type + speed              (20)": "a.shape_id",
}


def pearson(xs, ys):
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return num / (dx * dy) if dx and dy else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default=db.DEFAULT_METHOD)
    args = ap.parse_args()
    params = {"season": args.season, "method": args.method}

    conn = db.connect()
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("""SELECT max(s) FROM (SELECT count(*) FILTER (WHERE is_swing) s
                   FROM pitches WHERE season = %(season)s
                   GROUP BY batter_id, pitcher_id) x""", params)
    print(f"most swings any hitter took against any one pitcher: {cur.fetchone()[0]}"
          f"  (the test below needs {MIN_SWINGS_PER_HALF * 2})")

    for label, key in KEYS.items():
        cur.execute(SQL.format(key=key), params)
        rows = cur.fetchall()

        cells = {}        # (batter, stand, grp) -> half -> (swings, whiffs)
        by_hitter = {}    # half -> (batter, stand) -> [swings, whiffs]
        by_shape = {}     # half -> grp -> [swings, whiffs]
        overall = {}      # half -> [swings, whiffs]
        for batter, stand, grp, half, s, w in rows:
            cells.setdefault((batter, stand, grp), {})[half] = (s, w)
            h = by_hitter.setdefault(half, {}).setdefault((batter, stand), [0, 0])
            h[0] += s; h[1] += w
            g = by_shape.setdefault(half, {}).setdefault(grp, [0, 0])
            g[0] += s; g[1] += w
            o = overall.setdefault(half, [0, 0])
            o[0] += s; o[1] += w

        raw_x, raw_y, res_x, res_y = [], [], [], []
        for (batter, stand, grp), parts in cells.items():
            if 0 not in parts or 1 not in parts:
                continue
            if min(parts[0][0], parts[1][0]) < MIN_SWINGS_PER_HALF:
                continue
            vals = []
            for half in (0, 1):
                s, w = parts[half]
                hs, hw = by_hitter[half][(batter, stand)]
                gs, gw = by_shape[half][grp]
                os_, ow = overall[half]
                expected = hw / hs + (gw / gs - ow / os_)
                vals.append((w / s, w / s - expected))
            raw_x.append(vals[0][0]); raw_y.append(vals[1][0])
            res_x.append(vals[0][1]); res_y.append(vals[1][1])

        r_raw = pearson(raw_x, raw_y)
        r_res = pearson(res_x, res_y)
        sd = statistics.pstdev(res_x)
        print(f"\n{label}   {len(res_x):,} cells")
        print(f"   raw whiff rate        half-to-half r = {r_raw:.3f}"
              f"   full-sample r = {2*r_raw/(1+r_raw):.3f}")
        print(f"   hitter+pitch removed  half-to-half r = {r_res:.3f}"
              f"   full-sample r = {2*r_res/(1+r_res):.3f}")
        # Reliability and spread pull against each other: coarser groups are
        # measured more precisely but blur real differences, finer groups
        # capture more real difference but measure each one worse. What
        # matters is how much TRUE difference survives, and with reliability
        # rho the true variance is rho x the observed variance.
        full_res = 2 * r_res / (1 + r_res) if r_res > -1 else 0.0
        true_sd = sd * (full_res ** 0.5)
        print(f"   residual spread: sd {sd*100:.1f} pts observed, "
              f"{true_sd*100:.1f} pts real  <- how much genuine "
              f"hitter-by-pitch difference this grouping captures")

    conn.close()


if __name__ == "__main__":
    main()
