"""Record a team's active roster on players (Task 16).

The hitter pool the main screen iterates over is "Blue Jays who are not
pitchers", which is a query against this data rather than a hardcoded list of
names. Rosters change weekly; a list in the source would be wrong by Friday.

Re-runnable, in both directions: a new call-up is upserted, and anyone still
recorded as a Blue Jay who is no longer on the roster has `team` cleared, so a
traded player stops appearing on the page.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import requests
import db

API = "https://statsapi.mlb.com/api/v1/teams/{team_id}/roster"
TEAMS = {141: "TOR"}

# TWP is a two-way player: he pitches and he hits, so he belongs in the pool.
PITCHER_POSITIONS = {"P"}

UPSERT = """
INSERT INTO players (mlbam_id, full_name, team, position)
VALUES (%s, %s, %s, %s)
ON CONFLICT (mlbam_id) DO UPDATE
SET full_name  = EXCLUDED.full_name,
    team       = EXCLUDED.team,
    position   = EXCLUDED.position,
    updated_at = now()
"""


class RosterError(Exception):
    """The roster response is not shaped the way the loader requires."""


def fetch(team_id: int, roster_type: str = "active") -> dict:
    r = requests.get(API.format(team_id=team_id),
                     params={"rosterType": roster_type}, timeout=30)
    r.raise_for_status()
    return r.json()


def roster_rows(payload: dict, team: str) -> list[tuple]:
    rows = []
    for e in payload.get("roster", []):
        person = e.get("person") or {}
        position = e.get("position") or {}
        name = person.get("fullName", "<unnamed>")
        if not person.get("id"):
            raise RosterError(f"roster entry for {name} has no person id")
        if not position.get("abbreviation"):
            raise RosterError(f"roster entry for {name} has no position")
        rows.append((person["id"], person["fullName"], team,
                     position["abbreviation"]))
    return rows


def hitters(rows: list[tuple]) -> list[tuple]:
    return [r for r in rows if r[3] not in PITCHER_POSITIONS]


def departed(on_roster: set[int], recorded: set[int]) -> set[int]:
    """Players the database still calls ours who are no longer on the roster."""
    return recorded - on_roster


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--team-id", type=int, default=141)
    args = ap.parse_args()
    team = TEAMS.get(args.team_id, str(args.team_id))

    rows = roster_rows(fetch(args.team_id), team)
    if not rows:
        sys.exit(f"Roster for {team} came back empty; refusing to clear the team.")

    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT mlbam_id FROM players WHERE team = %s", (team,))
    gone = departed({r[0] for r in rows}, {r[0] for r in cur.fetchall()})

    cur.executemany(UPSERT, rows)
    if gone:
        cur.execute("UPDATE players SET team = NULL, position = NULL, "
                    "updated_at = now() WHERE mlbam_id = ANY(%s)", (list(gone),))
    conn.commit()

    print(f"{team}: {len(rows)} on the active roster, "
          f"{len(hitters(rows))} of them hitters"
          + (f", {len(gone)} no longer listed" if gone else ""))

    # A roster player with no pitches on file is not an error -- he may have
    # been called up last week -- but it is worth saying out loud rather than
    # letting him show up as a blank row on the page.
    cur.execute("""
        SELECT p.full_name, p.position, count(b.batter_id)
        FROM players p LEFT JOIN pitches b ON b.batter_id = p.mlbam_id
        WHERE p.team = %s AND p.position <> 'P'
        GROUP BY 1, 2 ORDER BY 3
    """, (team,))
    seen = cur.fetchall()
    print(f"\n{len(seen)} hitters in the pool:")
    for name, position, pitches in seen:
        note = "  <- no pitches on file (recent call-up?)" if pitches == 0 else ""
        print(f"  {name:<24} {position:<3} {pitches:>6,} pitches seen{note}")

    conn.close()


if __name__ == "__main__":
    main()
