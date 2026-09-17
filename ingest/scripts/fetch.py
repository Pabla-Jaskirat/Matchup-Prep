"""Pull Statcast pitch data in weekly chunks and cache them as parquet.

Fetching and loading are deliberately separate steps. This script only touches
the network and the local disk, so a failed load never costs a re-download and
an interrupted run resumes where it stopped.
"""

import argparse
import sys
import time
import warnings
from datetime import date, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

import pandas as pd
from pybaseball import statcast

# The ~25 Statcast columns the schema actually uses, out of 119 available.
COLUMNS = [
    "game_pk", "at_bat_number", "pitch_number", "game_date",
    "pitcher", "batter", "player_name", "p_throws", "stand",
    "pitch_type", "release_speed", "pfx_x", "pfx_z",
    "release_spin_rate", "release_extension",
    "plate_x", "plate_z", "zone",
    "balls", "strikes", "description", "events",
    "launch_speed", "estimated_woba_using_speedangle",
]

SEASON_START = "{year}-03-01"
SEASON_END = "{year}-11-15"


def week_chunks(start: date, end: date):
    """Yield (chunk_start, chunk_end) pairs covering start..end inclusive."""
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=6), end)
        yield cur, chunk_end
        cur = chunk_end + timedelta(days=1)


def fetch_season(season: int, outdir: Path, force: bool = False) -> None:
    today = date.today()
    start = date.fromisoformat(SEASON_START.format(year=season))
    end = min(date.fromisoformat(SEASON_END.format(year=season)), today)

    if start > end:
        sys.exit(f"Season {season} has not started yet.")

    outdir.mkdir(parents=True, exist_ok=True)
    chunks = list(week_chunks(start, end))
    print(f"Season {season}: {len(chunks)} weekly chunks, {start} to {end}\n")

    downloaded = skipped = total_rows = 0

    for i, (c_start, c_end) in enumerate(chunks, 1):
        path = outdir / f"{c_start.isoformat()}.parquet"
        tag = f"[{i:>2}/{len(chunks)}] {c_start} to {c_end}"

        if path.exists() and not force:
            skipped += 1
            total_rows += len(pd.read_parquet(path, columns=["game_pk"]))
            print(f"{tag}  skip (cached)")
            continue

        try:
            df = statcast(start_dt=c_start.isoformat(), end_dt=c_end.isoformat(),
                          verbose=False)
        except Exception as exc:                      # network, rate limit, parse
            print(f"{tag}  FAILED: {exc}")
            print("           re-run to retry this chunk; cached chunks are kept")
            continue

        if df is None or df.empty:
            print(f"{tag}  no games")
            # Don't cache an empty in-progress week — games may not be played yet.
            if c_end < today:
                pd.DataFrame(columns=COLUMNS).to_parquet(path, index=False)
            continue

        missing = [c for c in COLUMNS if c not in df.columns]
        if missing:
            sys.exit(f"Statcast schema changed — missing columns: {missing}")

        df = df[COLUMNS]
        # Never cache a partial week; it would be skipped forever.
        if c_end >= today:
            print(f"{tag}  {len(df):>6,} rows (in progress, not cached)")
            total_rows += len(df)
            continue

        df.to_parquet(path, index=False)
        downloaded += 1
        total_rows += len(df)
        print(f"{tag}  {len(df):>6,} rows")
        time.sleep(1)                                 # be polite to Baseball Savant

    print(f"\nDownloaded {downloaded}, skipped {skipped} cached.")
    print(f"Total rows on disk: {total_rows:,}")
    if not 400_000 < total_rows < 900_000:
        print("WARNING: row count outside the expected range for a full season.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--season", type=int, default=2026)
    p.add_argument("--force", action="store_true", help="re-download cached chunks")
    p.add_argument("--outdir", type=Path, default=None)
    a = p.parse_args()
    fetch_season(a.season, a.outdir or Path("data/raw") / str(a.season), a.force)
