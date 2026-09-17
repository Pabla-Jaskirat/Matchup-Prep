"""Look at the velocity distributions before bucketing anything.

Read-only. This script writes nothing and decides nothing. It prints the numbers
a human needs in order to choose velocity band boundaries defensibly, so that the
boundaries in db/shapes/v1_type_velo.json trace back to real percentiles rather
than to a guess.

The banding rule itself lives in PLAN.md and is applied by hand. That is
deliberate: the rule is mechanical, but noticing where it produces something
silly is not, and that judgment is the part worth being able to defend.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd

import db

# A band below this many league pitches is too thin to say anything about, so a
# (hand, pitch_type) group below it can't support even one band.
MIN_GROUP_PITCHES = 5_000

# Bimodality: a second peak must be at least this fraction of the tallest one to
# count as a pitch rather than as noise...
MIN_PEAK_FRACTION = 0.15
# ...and the dip between two peaks must fall to at most this fraction of the
# shorter peak. Without it, any bumpy shoulder reads as two pitches.
MAX_VALLEY_FRACTION = 0.75

# Tracking errors put a handful of 34 mph "sliders" in the data. They barely
# move the percentiles but they stretch the histogram across dozens of empty
# bins, so the display clips to this percentile range. Percentiles themselves
# are still computed over every pitch.
CLIP_LOW_PCT, CLIP_HIGH_PCT = 1, 99

QUERY = """
SELECT p_throws,
       pitch_type,
       release_speed::float8 AS release_speed,
       pfx_x::float8         AS pfx_x,
       pfx_z::float8         AS pfx_z
FROM pitches
WHERE season = %s
  AND pitch_type IS NOT NULL
  AND release_speed IS NOT NULL
"""

PITCH_NAMES = {
    "FF": "Four-Seam", "SI": "Sinker", "FC": "Cutter", "SL": "Slider",
    "ST": "Sweeper", "CU": "Curveball", "KC": "Knuckle-Curve", "CH": "Changeup",
    "FS": "Splitter", "SV": "Slurve", "FO": "Forkball", "EP": "Eephus",
    "KN": "Knuckleball", "SC": "Screwball",
}


# --- Pure statistics ---------------------------------------------------------

def normalize_break(df: pd.DataFrame) -> pd.DataFrame:
    """Flip horizontal break for left-handers.

    pfx_x is signed from the catcher's view, so a lefty's slider and a righty's
    slider carry opposite signs while breaking the same way relative to the arm
    that threw them. Comparing the two without this flip compares a number to
    its own negative. Vertical break needs no such correction — gravity does not
    care which hand you throw with.
    """
    out = df.copy()
    out.loc[out["p_throws"] == "L", "pfx_x"] *= -1
    return out


def velocity_stats(speeds) -> dict:
    """Count, five percentiles, and the interquartile range."""
    s = pd.Series(list(speeds), dtype="float64").dropna()
    p10, p25, p50, p75, p90 = np.percentile(s, [10, 25, 50, 75, 90])
    return {
        "n": int(s.size),
        "p10": float(p10), "p25": float(p25), "p50": float(p50),
        "p75": float(p75), "p90": float(p90),
        "iqr": float(p75 - p25),
    }


def clip_tails(values, lo_pct: float = CLIP_LOW_PCT,
               hi_pct: float = CLIP_HIGH_PCT) -> list[float]:
    """Drop the extreme tails so the histogram shows the distribution, not the
    tracking errors. Display only — never used for a reported statistic."""
    s = pd.Series(list(values), dtype="float64").dropna()
    lo, hi = np.percentile(s, [lo_pct, hi_pct])
    return [float(v) for v in s[(s >= lo) & (s <= hi)]]


def histogram_counts(values, bin_width: float = 1.0):
    """Bucket velocities into fixed-width bins. Returns (left edges, counts)."""
    s = pd.Series(list(values), dtype="float64").dropna().to_numpy()
    lo = np.floor(s.min() / bin_width) * bin_width
    hi = np.floor(s.max() / bin_width) * bin_width + bin_width
    edges = np.arange(lo, hi + bin_width / 2, bin_width)
    counts, _ = np.histogram(s, bins=edges)
    return [float(e) for e in edges[:-1]], [int(c) for c in counts]


def render_histogram(edges, counts, width: int = 40) -> list[str]:
    """One line per bin, longest bar scaled to `width` characters."""
    peak = max(counts) if counts else 0
    lines = []
    for edge, count in zip(edges, counts):
        bar = "#" * (round(count / peak * width) if peak else 0)
        lines.append(f"{edge:.0f}".ljust(4) + f"{bar} {count:,}")
    return lines


def find_peaks(counts) -> list[int]:
    """Indices of local maxima tall enough to be a pitch rather than noise."""
    if not counts:
        return []
    floor = max(counts) * MIN_PEAK_FRACTION
    return [
        i for i in range(1, len(counts) - 1)
        if counts[i] > counts[i - 1] and counts[i] > counts[i + 1]
        and counts[i] >= floor
    ]


def is_bimodal(counts) -> bool:
    """True when two tall peaks are separated by a genuine valley.

    This is the claim the README rests on — that some pitch types are two
    different pitches sharing one label — so the bar is set deliberately high.
    A shoulder is not a second pitch.
    """
    peaks = find_peaks(counts)
    for left, right in zip(peaks, peaks[1:]):
        valley = min(counts[left + 1:right])
        if valley <= min(counts[left], counts[right]) * MAX_VALLEY_FRACTION:
            return True
    return False


def correlation(xs, ys):
    """Pearson r, or None when either series never varies."""
    x = np.asarray(list(xs), dtype="float64")
    y = np.asarray(list(ys), dtype="float64")
    if x.std() == 0 or y.std() == 0:
        return None
    return float(np.corrcoef(x, y)[0, 1])


# --- Report ------------------------------------------------------------------

def load(season: int) -> pd.DataFrame:
    conn = db.connect()
    with conn.cursor() as cur:
        cur.execute(QUERY, (season,))
        df = pd.DataFrame(cur.fetchall(),
                          columns=[c.name for c in cur.description])
    conn.close()
    return df


def report(df: pd.DataFrame, season: int) -> None:
    df = normalize_break(df)
    groups = [(k, g) for k, g in df.groupby(["p_throws", "pitch_type"])
              if len(g) >= MIN_GROUP_PITCHES]
    groups.sort(key=lambda kv: len(kv[1]), reverse=True)

    print(f"\n{season} season · groups with at least "
          f"{MIN_GROUP_PITCHES:,} pitches · pfx_x sign-normalised for LHP\n"
          f"percentiles use every pitch; histograms clip the outer "
          f"{CLIP_LOW_PCT}% tails\n")

    bimodal = []
    for (throws, ptype), g in groups:
        s = velocity_stats(g["release_speed"])
        edges, counts = histogram_counts(clip_tails(g["release_speed"]))
        bi = is_bimodal(counts)
        r = correlation(g["release_speed"].fillna(g["release_speed"].mean()),
                        g["pfx_x"].fillna(g["pfx_x"].mean()))
        if bi:
            bimodal.append(f"{throws}HP {ptype}")

        name = PITCH_NAMES.get(ptype, ptype)
        print(f"{throws}HP  {ptype:<3} {name:<14} n={s['n']:>7,}   "
              f"velo: p10 {s['p10']:.1f}  p25 {s['p25']:.1f}  "
              f"p50 {s['p50']:.1f}  p75 {s['p75']:.1f}  p90 {s['p90']:.1f}")
        print(f"{'':21}IQR {s['iqr']:.1f}   "
              f"break: pfx_x {g['pfx_x'].mean():+.2f}  "
              f"pfx_z {g['pfx_z'].mean():+.2f}   "
              f"velo~break r {r:+.2f}   "
              f"BIMODAL? {'yes' if bi else 'no'}")
        for line in render_histogram(edges, counts, width=44):
            print(f"{'':21}{line}")
        print()

    print(f"{len(groups)} groups above the threshold.")
    print(f"bimodal: {', '.join(bimodal) if bimodal else 'none'}")
    print("\nNext: apply the banding rule in PLAN.md by hand and write "
          "db/shapes/v1_type_velo.json (Task 10).")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, default=2026)
    args = ap.parse_args()

    df = load(args.season)
    if df.empty:
        sys.exit(f"no pitches found for season {args.season}")
    report(df, args.season)


if __name__ == "__main__":
    main()
