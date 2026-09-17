"""Print random pitches as English sentences.

This exists so one row of the pitches table stops being abstract. If you can
read these and say what a row represents, Day 1 is done.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

PITCH_NAMES = {
    "FF": "four-seam fastball", "SI": "sinker", "FC": "cutter",
    "SL": "slider", "ST": "sweeper", "SV": "slurve", "CU": "curveball",
    "KC": "knuckle curve", "CH": "changeup", "FS": "splitter",
    "FO": "forkball", "KN": "knuckleball", "EP": "eephus", "SC": "screwball",
}

OUTCOMES = {
    "swinging_strike": "swung and missed",
    "swinging_strike_blocked": "swung and missed (ball in the dirt)",
    "called_strike": "took it for a strike",
    "ball": "took it for a ball",
    "blocked_ball": "took it for a ball in the dirt",
    "foul": "fouled it off",
    "foul_tip": "foul tipped it into the mitt",
    "hit_into_play": "put it in play",
    "hit_by_pitch": "was hit by it",
}

QUERY = """
SELECT p.game_date, pit.full_name, p.p_throws, bat.full_name, p.stand,
       p.pitch_type, p.release_speed, p.zone, p.balls, p.strikes,
       p.description, p.events, p.is_swing, p.is_whiff, p.in_zone
FROM pitches p
LEFT JOIN players pit ON pit.mlbam_id = p.pitcher_id
LEFT JOIN players bat ON bat.mlbam_id = p.batter_id
ORDER BY random()
LIMIT %s
"""


def sentence(row) -> str:
    (date, pitcher, throws, batter, stand, ptype, velo, zone,
     balls, strikes, desc, events, swing, whiff, in_zone) = row

    pitcher = pitcher or "Unknown pitcher"
    batter = batter or "Unknown batter"
    pitch = PITCH_NAMES.get(ptype, "unclassified pitch" if ptype is None
                            else f"{ptype} pitch")
    speed = f"{velo:.1f} mph " if velo is not None else ""
    outcome = OUTCOMES.get(desc, desc.replace("_", " "))
    where = ("in the zone" if in_zone else
             "out of the zone" if in_zone is False else "location not tracked")

    line = (f"{date}  {pitcher} ({throws}HP) threw a {speed}{pitch} "
            f"to {batter} (batting {stand}) on {balls}-{strikes}, "
            f"{where} — {batter.split()[-1]} {outcome}.")
    if events:
        line += f"  Result: {events.replace('_', ' ')}."
    return line


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=10)
    n = ap.parse_args().n

    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(QUERY, (n,))
        for row in cur.fetchall():
            print(sentence(row), "\n")
