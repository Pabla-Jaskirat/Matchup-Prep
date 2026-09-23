"""Remove every row belonging to a superseded shape method.

`method` leads the primary key of every shape and stats table so that changing
the rule is a new name rather than a rewrite of rows that already mean
something else. The cost of that design is that the old rule's rows do not go
anywhere by themselves: after the v1_type_velo -> v2_hand_type cutover both
sets sat in the database at once, and shape_assignments alone is 138 MB
against a 500 MB tier.

So retiring a method is a deliberate, named operation rather than a DELETE
typed at a prompt. It refuses to remove the method the pipeline is currently
building, which is the mistake that would cost a full re-ingest.

    python retire_method.py --method v1_type_velo
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db

# Children before parents: shape_assignments and the stats tables carry
# foreign keys into pitch_shapes, so pitch_shapes goes last.
TABLES = [
    "shape_assignments",
    "hitter_shape_stats",
    "hitter_shape_zone_stats",
    "league_shape_stats",
    "pitcher_shape_stats",
    "pitcher_unshaped_stats",
    "pitch_shapes",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--method", required=True,
                    help="the retired method, e.g. v1_type_velo")
    ap.add_argument("--dry-run", action="store_true",
                    help="count the rows without removing them")
    args = ap.parse_args()

    if args.method == db.DEFAULT_METHOD:
        sys.exit(f"{args.method} is the method in use (db.DEFAULT_METHOD). "
                 "Retiring it would empty the app.")

    conn = db.connect()
    conn.autocommit = False
    cur = conn.cursor()

    total = 0
    for table in TABLES:
        if args.dry_run:
            cur.execute(f"SELECT count(*) FROM {table} WHERE method = %s",
                        (args.method,))
            n = cur.fetchone()[0]
        else:
            cur.execute(f"DELETE FROM {table} WHERE method = %s", (args.method,))
            n = cur.rowcount
        total += n
        print(f"  {table:<26} {n:>9,} rows"
              + ("  (dry run)" if args.dry_run else " removed"))

    if args.dry_run:
        conn.rollback()
        print(f"\n{total:,} rows would be removed. Re-run without --dry-run.")
    else:
        conn.commit()
        print(f"\n{total:,} rows removed for method {args.method}.")
    conn.close()


if __name__ == "__main__":
    main()
