"""Load db/shapes/v1_type_velo.json into pitch_shapes (Task 12, first half).

The file is the decision; this script is only the courier. It validates the
file before touching the database, because the file is hand-editable and a
gap or an overlap in the bands would not raise an error later -- it would
quietly orphan or double-count pitches.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

SHAPES = Path(__file__).resolve().parents[2] / "db" / "shapes"

UPSERT = """
INSERT INTO pitch_shapes (method, shape_id, label, p_throws, pitch_type,
                          velo_min, velo_max, min_percentile, max_percentile,
                          season, league_pitches)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (method, shape_id) DO UPDATE
SET label          = EXCLUDED.label,
    p_throws       = EXCLUDED.p_throws,
    pitch_type     = EXCLUDED.pitch_type,
    velo_min       = EXCLUDED.velo_min,
    velo_max       = EXCLUDED.velo_max,
    min_percentile = EXCLUDED.min_percentile,
    max_percentile = EXCLUDED.max_percentile,
    season         = EXCLUDED.season,
    league_pitches = EXCLUDED.league_pitches
"""


class ShapeFileError(Exception):
    """The shape file would produce wrong assignments if loaded."""


def read_file(method: str = "v1_type_velo") -> dict:
    return json.loads((SHAPES / f"{method}.json").read_text())


def validate(doc: dict) -> None:
    seen: set[str] = set()
    for g in doc["groups"]:
        where = f"{g['p_throws']}HP {g['pitch_type']}"
        bands = g["bands"]
        if not bands:
            raise ShapeFileError(f"{where}: no bands")

        if bands[0]["velo_min"] is not None or bands[-1]["velo_max"] is not None:
            raise ShapeFileError(
                f"{where}: outer bands must be unbounded, or a velocity "
                "outlier belongs to no shape")

        for lower, upper in zip(bands, bands[1:]):
            if lower["velo_max"] < upper["velo_min"]:
                raise ShapeFileError(
                    f"{where}: gap between {lower['velo_max']} and "
                    f"{upper['velo_min']} -- pitches in it would be unassigned")
            if lower["velo_max"] > upper["velo_min"]:
                raise ShapeFileError(
                    f"{where}: overlap between {upper['velo_min']} and "
                    f"{lower['velo_max']} -- pitches in it would be counted twice")

        for b in bands:
            if b["shape_id"] in seen:
                raise ShapeFileError(f"duplicate shape_id {b['shape_id']}")
            seen.add(b["shape_id"])


def stale_shape_ids(in_file: set[str], in_db: set[str]) -> set[str]:
    """Shapes the database still holds that the file no longer defines.

    The file is the definition, so these have to go. Removing one cascades to
    its assignments and its stats rows -- which is correct, and recoverable by
    re-running assign_shapes and aggregate.py, but it is destructive enough to
    be printed rather than done quietly.
    """
    return in_db - in_file


def rows_from(doc: dict) -> list[tuple]:
    rows = [
        (doc["method"], b["shape_id"], b["label"], g["p_throws"], g["pitch_type"],
         b["velo_min"], b["velo_max"], b["min_percentile"], b["max_percentile"],
         doc["season"], b["pitches"])
        for g in doc["groups"] for b in g["bands"]
    ]
    return sorted(rows, key=lambda r: r[1])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--method", default="v1_type_velo")
    args = ap.parse_args()

    doc = read_file(args.method)
    validate(doc)
    rows = rows_from(doc)

    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SELECT shape_id FROM pitch_shapes WHERE method = %s", (args.method,))
    stale = stale_shape_ids({r[1] for r in rows}, {r[0] for r in cur.fetchall()})

    cur.executemany(UPSERT, rows)
    if stale:
        cur.execute("DELETE FROM pitch_shapes WHERE method = %s "
                    "AND shape_id = ANY(%s)", (args.method, sorted(stale)))
        print(f"removed {len(stale)} shapes no longer in the file: "
              f"{', '.join(sorted(stale))}\n"
              "  their assignments and stats rows cascaded away with them; "
              "re-run assign_shapes and aggregate.py")
    conn.commit()

    cur.execute("SELECT count(*) FROM pitch_shapes WHERE method = %s", (args.method,))
    print(f"{args.method}: {len(rows)} shapes in the file, "
          f"{cur.fetchone()[0]} in pitch_shapes")
    conn.close()


if __name__ == "__main__":
    main()
