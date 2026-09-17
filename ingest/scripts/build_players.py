"""Fill the players table from ids already present in pitches.

Uses MLB's own StatsAPI rather than pybaseball's name register: the register
lags for recent debuts, and a spot check found ~37% of ids in the 2026 season
unresolved (all low-volume call-ups, but Day 4 search needs every name).
StatsAPI also returns the team, which the register does not.
"""

import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import requests
import db

API = "https://statsapi.mlb.com/api/v1/people"
BATCH = 100
FIELDS = "people,id,fullName,pitchHand,batSide,code,currentTeam,abbreviation"

UPSERT = """
INSERT INTO players (mlbam_id, full_name, throws, team)
VALUES (%s, %s, %s, %s)
ON CONFLICT (mlbam_id) DO UPDATE
SET full_name  = EXCLUDED.full_name,
    throws     = COALESCE(EXCLUDED.throws, players.throws),
    team       = COALESCE(EXCLUDED.team, players.team),
    updated_at = now()
"""


def fetch_people(ids: list[int]) -> list[tuple]:
    rows = []
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        r = requests.get(API, params={"personIds": ",".join(map(str, chunk)),
                                      "fields": FIELDS}, timeout=30)
        r.raise_for_status()
        for p in r.json().get("people", []):
            rows.append((
                p["id"],
                p.get("fullName"),
                (p.get("pitchHand") or {}).get("code"),
                (p.get("currentTeam") or {}).get("abbreviation"),
            ))
        print(f"  resolved {len(rows):,}/{len(ids):,}")
    return rows


def main() -> None:
    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT pitcher_id FROM pitches UNION SELECT batter_id FROM pitches")
    ids = sorted(r[0] for r in cur.fetchall())
    print(f"{len(ids):,} distinct players in pitches")

    rows = [r for r in fetch_people(ids) if r[1]]
    cur.executemany(UPSERT, rows)
    conn.commit()

    # Throwing hand from the pitches themselves is the more reliable source:
    # it is a fact of what actually happened, not a roster attribute.
    cur.execute("""
        UPDATE players p SET throws = t.hand
        FROM (SELECT pitcher_id, mode() WITHIN GROUP (ORDER BY p_throws) hand
              FROM pitches GROUP BY pitcher_id) t
        WHERE p.mlbam_id = t.pitcher_id AND p.throws IS DISTINCT FROM t.hand
    """)
    print(f"  corrected throwing hand on {cur.rowcount} players from pitch data")
    conn.commit()

    cur.execute("""
        WITH ids AS (SELECT pitcher_id id FROM pitches
                     UNION SELECT batter_id FROM pitches)
        SELECT count(*) FILTER (WHERE pl.mlbam_id IS NULL), count(*)
        FROM ids LEFT JOIN players pl ON pl.mlbam_id = ids.id
    """)
    missing, total = cur.fetchone()
    print(f"\nplayers: {total - missing:,}/{total:,} named ({missing} missing)")
    conn.close()
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
