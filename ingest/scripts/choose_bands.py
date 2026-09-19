"""Turn the measured velocity distributions into the shape definitions (Task 10).

This is the one human decision in the pipeline, so it is stored as data rather
than code: this script writes db/shapes/v1_type_velo.json and nothing else
reads the database to decide band edges. Widening the bands on Day 3 is an
edit to that file and a re-run of assign_shapes, not a migration.

The rule, in full:

  1. A (hand, pitch_type) group needs 5,000 league pitches to exist at all.
  2. Its velocity IQR -- the width of the middle half -- picks the band count:
     5.0 mph or less -> 1 band, over 5.0 -> 3 bands at p33 and p67.
  3. Any band holding fewer than 5,000 pitches is merged into its smaller
     neighbour, repeatedly, until every surviving band clears the floor.

Spread earns bands; the sample floor can overrule the spread. RHP knuckle-curves
have the widest spread in the data (6.2 mph) and still end up as a single shape,
because 9,476 pitches cannot support three bands of ~3,200.

**Revised 2026-09-18 after the Task 15 coverage audit.** The first version also
split every group between 2.5 and 5.0 mph into two bands, which produced 33
shapes -- and a page where a typical matchup had one usable number out of a
seven-shape arsenal, because splitting a group halves each hitter's sample.

Measured: dropping those middle splits raises a typical matchup from 2 usable
shapes to 3, and the coverage is identical to abandoning velocity bands
altogether. So the bands that survive are free: they keep real information at
no measurable cost. The ones that were cut were not separating anything. RHP
sliders span 3.5 mph, so a "slow" one is 85 and a "fast" one is 88 -- the same
pitch. RHP curveballs span 5.6, and a 73 and an 87 are genuinely different
pitches to stand in against.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np

from analyze_shapes import MIN_GROUP_PITCHES, PITCH_NAMES, load, velocity_stats

# A group is split only when its middle half spans more than this. Below it,
# the slow and fast versions of the pitch are the same pitch.
THREE_BANDS_ABOVE_IQR = 5.0
MIN_BAND_PITCHES = 5_000

METHOD = "v1_type_velo"
OUT = Path(__file__).resolve().parents[2] / "db" / "shapes" / f"{METHOD}.json"


def band_count(iqr: float) -> int:
    """How many velocity slices this group's spread justifies."""
    return 3 if iqr > THREE_BANDS_ABOVE_IQR else 1


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


def build(df, season: int) -> dict:
    groups = []
    for (hand, pitch_type), g in df.groupby(["p_throws", "pitch_type"]):
        speeds = g["release_speed"].dropna()
        if speeds.size < MIN_GROUP_PITCHES:
            continue
        stats = velocity_stats(speeds)
        n_bands = band_count(stats["iqr"])
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
        "method": METHOD,
        "season": season,
        "generated": date.today().isoformat(),
        "rule": {
            "min_group_pitches": MIN_GROUP_PITCHES,
            "three_bands_above_iqr": THREE_BANDS_ABOVE_IQR,
            "min_band_pitches": MIN_BAND_PITCHES,
            "interval": "velo_min <= release_speed < velo_max; null is unbounded",
        },
        "shapes": sum(len(g["bands"]) for g in groups),
        "groups": groups,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    args = ap.parse_args()

    doc = build(load(args.season), args.season)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2) + "\n")

    print(f"{doc['shapes']} shapes across {len(doc['groups'])} groups -> "
          f"{OUT.relative_to(Path.cwd())}\n")
    for g in doc["groups"]:
        collapsed = "" if len(g["bands"]) == g["bands_by_spread"] else \
            f"  (spread said {g['bands_by_spread']}, floor cut it to {len(g['bands'])})"
        print(f"{g['p_throws']}HP {g['pitch_type']:<3} "
              f"n={g['pitches']:>7,}  IQR {g['iqr']:>4}{collapsed}")
        for b in g["bands"]:
            print(f"    {b['shape_id']:<9} {b['label']:<28} {b['pitches']:>7,}")


if __name__ == "__main__":
    main()
