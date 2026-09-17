"""Load cached parquet chunks into the pitches table, idempotently.

Each file goes through an UNLOGGED staging table via COPY (fast), then upserts
into pitches on the natural key. Re-running the whole loader leaves the row
count unchanged -- that is the property worth testing.
"""

import argparse
import io
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import db

# Statcast name -> our name. Everything else keeps its name.
RENAMES = {
    "pitcher": "pitcher_id",
    "batter": "batter_id",
    "release_spin_rate": "spin_rate",
    "release_extension": "extension",
    "estimated_woba_using_speedangle": "est_woba",
}

# Non-generated columns, in COPY order.
COLUMNS = [
    "game_pk", "at_bat_number", "pitch_number", "game_date",
    "pitcher_id", "batter_id", "p_throws", "stand",
    "pitch_type", "release_speed", "pfx_x", "pfx_z", "spin_rate", "extension",
    "plate_x", "plate_z", "zone", "balls", "strikes",
    "description", "events", "launch_speed", "est_woba",
]

KEY = ["game_pk", "at_bat_number", "pitch_number"]

STAGING = """
CREATE UNLOGGED TABLE IF NOT EXISTS pitches_staging
    (LIKE pitches INCLUDING DEFAULTS EXCLUDING GENERATED EXCLUDING CONSTRAINTS)
"""

# DISTINCT ON guards against a pitch appearing twice inside one file: ON CONFLICT
# cannot update the same row twice in a single statement.
UPSERT = f"""
INSERT INTO pitches ({', '.join(COLUMNS)})
SELECT DISTINCT ON ({', '.join(KEY)}) {', '.join(COLUMNS)}
FROM pitches_staging
ON CONFLICT ({', '.join(KEY)}) DO UPDATE SET
{', '.join(f'    {c} = EXCLUDED.{c}' for c in COLUMNS if c not in KEY)}
"""


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns=RENAMES)
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        sys.exit(f"Parquet is missing columns: {missing}")

    df = df[COLUMNS].copy()

    # description is NOT NULL in the schema; a row without it tells us nothing.
    df = df[df["description"].notna()]

    # Statcast ships these as floats with NaN; the schema wants integers.
    for col in ["game_pk", "at_bat_number", "pitch_number", "pitcher_id",
                "batter_id", "spin_rate", "zone", "balls", "strikes"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    return df.dropna(subset=KEY + ["game_date", "pitcher_id", "batter_id",
                                   "p_throws", "stand"])


def load_file(cur, path: Path) -> int:
    df = prepare(pd.read_parquet(path))
    if df.empty:
        return 0

    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False, na_rep="")
    buf.seek(0)

    cur.execute("TRUNCATE pitches_staging")
    cur.copy_expert(
        f"COPY pitches_staging ({', '.join(COLUMNS)}) "
        "FROM STDIN WITH (FORMAT csv, NULL '')", buf)
    cur.execute(UPSERT)
    return len(df)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--season", type=int, default=2026)
    a = p.parse_args()

    raw = Path("data/raw") / str(a.season)
    files = sorted(raw.glob("*.parquet"))
    if not files:
        sys.exit(f"No parquet files in {raw} -- run fetch.py first.")

    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute(STAGING)

    cur.execute("SELECT count(*) FROM pitches")
    before = cur.fetchone()[0]
    conn.commit()

    print(f"{len(files)} files, {before:,} rows already in pitches\n")
    started = time.time()
    total = 0

    for i, path in enumerate(files, 1):
        try:
            n = load_file(cur, path)
            conn.commit()
        except Exception as exc:
            conn.rollback()
            print(f"[{i:>2}/{len(files)}] {path.name}  FAILED: {str(exc)[:160]}")
            continue
        total += n
        print(f"[{i:>2}/{len(files)}] {path.name}  {n:>6,} rows")

    cur.execute("SELECT count(*) FROM pitches")
    after = cur.fetchone()[0]
    conn.commit()
    conn.close()

    print(f"\nProcessed {total:,} rows from parquet in {time.time() - started:.0f}s")
    print(f"pitches: {before:,} -> {after:,}  (added {after - before:,})")


if __name__ == "__main__":
    main()
