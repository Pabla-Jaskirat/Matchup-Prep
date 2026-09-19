"""Sanity checks on the loaded data. Run after any refresh."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

CHECKS = [
    ("pitches loaded",        "SELECT count(*) FROM pitches", lambda v: v > 500_000),
    ("players named",         "SELECT count(*) FROM players", lambda v: v > 2_000),
    ("null stand/p_throws",   "SELECT count(*) FROM pitches "
                              "WHERE stand IS NULL OR p_throws IS NULL", lambda v: v == 0),
    ("distinct game dates",   "SELECT count(DISTINCT game_date) FROM pitches",
                              lambda v: v > 150),
    ("pct null pitch_type",   "SELECT round(100.0*count(*) FILTER "
                              "(WHERE pitch_type IS NULL)/count(*), 2) FROM pitches",
                              lambda v: v < 2),
    ("pct untracked zone",    "SELECT round(100.0*count(*) FILTER "
                              "(WHERE in_zone IS NULL)/count(*), 2) FROM pitches",
                              lambda v: v < 5),
    ("orphan pitcher ids",    "SELECT count(*) FROM (SELECT DISTINCT pitcher_id FROM "
                              "pitches) p LEFT JOIN players pl ON pl.mlbam_id = "
                              "p.pitcher_id WHERE pl.mlbam_id IS NULL", lambda v: v == 0),

    # The hitter pool is what the main screen iterates over. If build_roster
    # silently stopped working, this is where it surfaces.
    ("jays hitters",          "SELECT count(*) FROM players "
                              "WHERE team = 'TOR' AND position <> 'P'",
                              lambda v: 9 <= v <= 20),
    ("jays hitters unseen",   "SELECT count(*) FROM players p WHERE p.team='TOR' "
                              "AND p.position <> 'P' AND NOT EXISTS (SELECT 1 FROM "
                              "pitches b WHERE b.batter_id = p.mlbam_id)",
                              lambda v: v == 0),

    ("shapes defined",        "SELECT count(*) FROM pitch_shapes "
                              "WHERE method = 'v1_type_velo'", lambda v: 32 <= v <= 48),
    ("pct pitches assigned",  "SELECT round(100.0*count(a.*)/count(*), 1) "
                              "FROM pitches p LEFT JOIN shape_assignments a "
                              "ON a.method='v1_type_velo' AND a.game_pk=p.game_pk "
                              "AND a.at_bat_number=p.at_bat_number "
                              "AND a.pitch_number=p.pitch_number "
                              "WHERE p.pitch_type IS NOT NULL "
                              "AND p.release_speed IS NOT NULL", lambda v: v >= 97),
    # The one that would catch a band edit gone wrong: every assigned pitch
    # must sit inside the band it was assigned to, on speed AND hand AND type.
    ("misassigned pitches",   "SELECT count(*) FROM shape_assignments a "
                              "JOIN pitches p USING (game_pk, at_bat_number, pitch_number) "
                              "JOIN pitch_shapes s ON s.method=a.method "
                              "AND s.shape_id=a.shape_id WHERE "
                              "(s.velo_min IS NOT NULL AND p.release_speed <  s.velo_min) OR "
                              "(s.velo_max IS NOT NULL AND p.release_speed >= s.velo_max) OR "
                              "s.p_throws <> p.p_throws OR s.pitch_type <> p.pitch_type",
                              lambda v: v == 0),
]

if __name__ == "__main__":
    failed = 0
    with db.connect() as conn, conn.cursor() as cur:
        for label, sql, ok in CHECKS:
            cur.execute(sql)
            value = cur.fetchone()[0]
            passed = ok(value)
            failed += not passed
            print(f"  {'PASS' if passed else 'FAIL'}  {label:<22} {value:,}"
                  if isinstance(value, int) else
                  f"  {'PASS' if passed else 'FAIL'}  {label:<22} {value}")
    sys.exit(1 if failed else 0)
