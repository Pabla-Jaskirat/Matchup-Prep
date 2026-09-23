"""Turn the measured velocity distributions into the shape definitions (Task 10).

This is the one human decision in the pipeline, so it is stored as data rather
than code: this script writes db/shapes/<method>.json and nothing else reads
the database to decide what a shape is. Changing the rule is an edit here and a
re-run of derive_shapes and assign_shapes, not a migration.

The rule, in full:

  1. A (hand, pitch_type) group needs 5,000 league pitches to exist at all.
  2. That group is the shape. Hand and pitch type, nothing else.

Hand is not a formality. A sweeper breaks away from the arm that threw it, so
against a left-handed hitter a lefty's sweeper runs off the plate and a
righty's runs into the bat path. Measured 2026: 34.3% whiffs against the
first, 28.9% against the second. Same label, 5.4 points apart -- more than the
whole hitter-by-pitch signal this tool is built on. Dropping hand and grouping
on the label alone costs 0.5 points of that signal (5.0 -> 4.5).

**Velocity bands were removed 2026-09-23, after measuring them.**

The previous rule (method v1_type_velo) also split a group into three velocity
bands when its IQR exceeded 5.0 mph. Only two groups in the league ever
qualified -- RHP curveballs and RHP splitters -- and the split was measured to
be worth nothing:

  * Real hitter-by-pitch signal captured: 5.0 points at 16 shapes, 4.9 at 20.
    The split made it very slightly worse. (`make reliability`.)
  * Coverage: no Blue Jay cleared the 50-pitch cell floor on any banded shape
    -- the best was 39 -- so those four extra shapes showed nothing to anyone.
    Merging them back returns 12 displayable cells.

The splitting rule is kept behind --split-above-iqr rather than deleted, so
the rejected experiment stays reproducible:

    python choose_bands.py --split-above-iqr 5.0 --method v1_type_velo

An earlier revision (2026-09-18) had also cut a two-band split for groups
between 2.5 and 5.0 mph, which produced 33 shapes and a page where a typical
matchup had one usable number in a seven-shape arsenal. The direction was
consistent every time it was measured: splitting a group halves every hitter's
sample, and velocity was never what separated the pitches.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np

import db
from analyze_shapes import MIN_GROUP_PITCHES, PITCH_NAMES, load, velocity_stats

# The shipped rule never splits on speed. Passing a threshold reinstates the
# old behaviour: a group whose middle half spans more than that many mph is
# cut into three bands. Kept so the measurement that rejected it can be redone.
SPLIT_ABOVE_IQR = None
MIN_BAND_PITCHES = 5_000

SHAPES_DIR = Path(__file__).resolve().parents[2] / "db" / "shapes"


def band_count(iqr: float, split_above_iqr: float | None = SPLIT_ABOVE_IQR) -> int:
    """How many velocity slices this group gets.

    One, unless a caller asks for the old velocity rule back.
    """
    if split_above_iqr is None:
        return 1
    return 3 if iqr > split_above_iqr else 1


def cut_percentiles(n_bands: int) -> list[int]:
    return {1: [], 2: [50], 3: [33, 67]}[n_bands]


def make_bands(cuts: list[tuple[float, int]]) -> list[dict]:
    """Half-open ranges from a list of (velocity, percentile) cut points.

    velo_min <= speed < velo_max, with the outer edges open so no pitch of the
    right type can fall outside every band.
    """
    edges = [(None, None)] + [(v, p) for v, p in cuts] + [(None, None)]
    bands = []
    for (lo, lo_pct), (hi, hi_pct) in zip(edges, edges[1:]):
        bands.append({"velo_min": lo, "velo_max": hi, "pitches": 0,
                      "min_percentile": lo_pct, "max_percentile": hi_pct})
    return bands


def count_bands(speeds, bands: list[dict]) -> list[dict]:
    for speed in speeds:
        for band in bands:
            if ((band["velo_min"] is None or speed >= band["velo_min"]) and
                    (band["velo_max"] is None or speed < band["velo_max"])):
                band["pitches"] += 1
                break
    return bands


def collapse_under_floor(bands: list[dict], floor: int = MIN_BAND_PITCHES) -> list[dict]:
    """Merge thin bands away until every survivor clears the sample floor.

    The thinnest band merges into whichever neighbour is smaller, which keeps
    the well-sampled band from being diluted by a sliver.
    """
    bands = [dict(b) for b in bands]
    while len(bands) > 1 and min(b["pitches"] for b in bands) < floor:
        i = min(range(len(bands)), key=lambda k: bands[k]["pitches"])
        if i == 0:
            j = 1
        elif i == len(bands) - 1:
            j = i - 1
        else:
            j = i - 1 if bands[i - 1]["pitches"] <= bands[i + 1]["pitches"] else i + 1
        left, right = sorted((i, j))
        bands[left:right + 1] = [{
            "velo_min": bands[left]["velo_min"],
            "velo_max": bands[right]["velo_max"],
            "pitches": bands[left]["pitches"] + bands[right]["pitches"],
            "min_percentile": bands[left]["min_percentile"],
            "max_percentile": bands[right]["max_percentile"],
        }]
    return bands


def shape_id(hand: str, pitch_type: str, index: int) -> str:
    return f"{hand}-{pitch_type}-{index + 1}"


def label(hand: str, pitch_type: str, bands: list[dict], index: int) -> str:
    name = f"{hand}HP {PITCH_NAMES.get(pitch_type, pitch_type)}"
    if len(bands) == 1:
        return name
    band = bands[index]
    if band["velo_min"] is None:
        return f"{name} under {round(band['velo_max'])}"
    if band["velo_max"] is None:
        return f"{name} {round(band['velo_min'])}+"
    return f"{name} {round(band['velo_min'])}-{round(band['velo_max'])}"


def build(df, season: int, method: str,
          split_above_iqr: float | None = SPLIT_ABOVE_IQR) -> dict:
    groups = []
    for (hand, pitch_type), g in df.groupby(["p_throws", "pitch_type"]):
        speeds = g["release_speed"].dropna()
        if speeds.size < MIN_GROUP_PITCHES:
            continue
        stats = velocity_stats(speeds)
        n_bands = band_count(stats["iqr"], split_above_iqr)
        cuts = [(round(float(np.percentile(speeds, p)), 1), p)
                for p in cut_percentiles(n_bands)]
        bands = collapse_under_floor(count_bands(speeds.tolist(), make_bands(cuts)))
        groups.append({
            "p_throws": hand, "pitch_type": pitch_type,
            "pitches": stats["n"], "iqr": round(stats["iqr"], 1),
            "bands_by_spread": n_bands, "bands": [
                {"shape_id": shape_id(hand, pitch_type, i),
                 "label": label(hand, pitch_type, bands, i), **b}
                for i, b in enumerate(bands)
            ],
        })
    groups.sort(key=lambda g: -g["pitches"])
    return {
        "method": method,
        "season": season,
        "generated": date.today().isoformat(),
        "rule": {
            "min_group_pitches": MIN_GROUP_PITCHES,
            "split_above_iqr": split_above_iqr,
            "min_band_pitches": MIN_BAND_PITCHES,
            "interval": "velo_min <= release_speed < velo_max; null is unbounded",
        },
        "shapes": sum(len(g["bands"]) for g in groups),
        "groups": groups,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--method", default=db.DEFAULT_METHOD)
    ap.add_argument("--split-above-iqr", type=float, default=SPLIT_ABOVE_IQR,
                    help="reinstate the old velocity rule at this IQR, in mph")
    args = ap.parse_args()

    doc = build(load(args.season), args.season, args.method, args.split_above_iqr)

    out = SHAPES_DIR / f"{args.method}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2) + "\n")

    print(f"{doc['shapes']} shapes across {len(doc['groups'])} groups -> "
          f"{out.relative_to(Path.cwd())}\n")
    for g in doc["groups"]:
        collapsed = "" if len(g["bands"]) == g["bands_by_spread"] else \
            f"  (spread said {g['bands_by_spread']}, floor cut it to {len(g['bands'])})"
        print(f"{g['p_throws']}HP {g['pitch_type']:<3} "
              f"n={g['pitches']:>7,}  IQR {g['iqr']:>4}{collapsed}")
        for b in g["bands"]:
            print(f"    {b['shape_id']:<9} {b['label']:<28} {b['pitches']:>7,}")


if __name__ == "__main__":
    main()
