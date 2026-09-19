"""Structural guards on the migration files.

A migration cannot be unit-tested the way a function can, but the decisions
encoded in one can be. The decision worth guarding here is that `method` leads
the primary key of both shape tables: it is what lets a future movement-based
shape definition arrive as an INSERT alongside v1 rather than as a migration
that rewrites it.
"""

from pathlib import Path

import schema_meta as sm

MIGRATIONS = Path(__file__).resolve().parents[2] / "db" / "migrations"


# --- the parser -------------------------------------------------------------

def test_it_finds_every_created_table():
    sql = "CREATE TABLE a (x int);\nCREATE TABLE b (\n  y int\n);\n"
    assert sm.tables(sql) == ["a", "b"]


def test_it_reads_a_table_level_primary_key():
    sql = "CREATE TABLE t (\n  a text,\n  b int,\n  PRIMARY KEY (a, b)\n);"
    assert sm.primary_key(sql, "t") == ["a", "b"]


def test_it_reads_a_column_level_primary_key():
    sql = "CREATE TABLE t (\n  id integer PRIMARY KEY,\n  name text\n);"
    assert sm.primary_key(sql, "t") == ["id"]


def test_a_table_without_a_primary_key_reads_as_empty():
    sql = "CREATE TABLE t (\n  a text\n);"
    assert sm.primary_key(sql, "t") == []


def test_it_is_not_confused_by_a_second_table_in_the_same_file():
    sql = ("CREATE TABLE first (\n  a text,\n  PRIMARY KEY (a)\n);\n"
           "CREATE TABLE second (\n  b text,\n  c int,\n  PRIMARY KEY (b, c)\n);\n")
    assert sm.primary_key(sql, "second") == ["b", "c"]


def test_a_keyword_inside_a_comment_is_ignored():
    # Comments in these migrations explain the keys in prose, so the parser
    # must read the SQL and not the explanation.
    sql = ("-- CREATE TABLE decoy (x int);\n"
           "CREATE TABLE real_one (\n"
           "  a text,  -- PRIMARY KEY (wrong, wrong)\n"
           "  PRIMARY KEY (a)\n);")
    assert sm.tables(sql) == ["real_one"]
    assert sm.primary_key(sql, "real_one") == ["a"]


# --- the migrations themselves ----------------------------------------------

def test_migration_numbers_are_unique_and_gapless():
    # migrate.py runs files in filename order and records each by name, so a
    # duplicate number would silently skip one and a gap usually means a file
    # was lost.
    numbers = sorted(int(p.name[:3]) for p in MIGRATIONS.glob("*.sql"))
    assert numbers == list(range(1, len(numbers) + 1))


def test_the_shape_tables_lead_their_primary_key_with_method():
    # The whole point: v2_movement becomes rows, not a migration.
    sql = (MIGRATIONS / "003_shapes.sql").read_text()
    assert sm.primary_key(sql, "pitch_shapes")[0] == "method"
    assert sm.primary_key(sql, "shape_assignments")[0] == "method"


def test_an_assignment_is_keyed_by_the_pitch_it_describes():
    # Same natural key as pitches, so re-running assign_shapes upserts rather
    # than duplicating.
    sql = (MIGRATIONS / "003_shapes.sql").read_text()
    assert sm.primary_key(sql, "shape_assignments") == [
        "method", "game_pk", "at_bat_number", "pitch_number"]


def test_a_group_cannot_acquire_two_open_bottom_bands():
    # Every group's slowest band has velo_min NULL, and Postgres' default rule
    # treats two NULLs as different values -- so without NULLS NOT DISTINCT the
    # uniqueness constraint would permit exactly the duplicate it exists to stop.
    sql = "\n".join(p.read_text() for p in sorted(MIGRATIONS.glob("*.sql")))
    assert "UNIQUE NULLS NOT DISTINCT (method, p_throws, pitch_type, velo_min)" in sql


# --- parsing columns and foreign keys ---------------------------------------

def test_it_lists_the_columns_of_a_table():
    sql = "CREATE TABLE t (\n  a text NOT NULL,\n  b smallint,\n  PRIMARY KEY (a)\n);"
    assert sm.columns(sql, "t") == ["a", "b"]


def test_a_table_constraint_is_not_mistaken_for_a_column():
    sql = ("CREATE TABLE t (\n  a text,\n  PRIMARY KEY (a),\n"
           "  FOREIGN KEY (a) REFERENCES u (a),\n"
           "  CONSTRAINT c CHECK (a <> ''),\n  UNIQUE (a)\n);")
    assert sm.columns(sql, "t") == ["a"]


def test_a_numeric_precision_does_not_split_a_column():
    # numeric(5,4) contains a comma, which a naive split on commas would treat
    # as a column boundary.
    sql = "CREATE TABLE t (\n  rate numeric(5,4),\n  n integer\n);"
    assert sm.columns(sql, "t") == ["rate", "n"]


def test_it_reads_a_composite_foreign_key():
    sql = ("CREATE TABLE t (\n  m text, s text,\n"
           "  FOREIGN KEY (m, s) REFERENCES pitch_shapes (method, shape_id)\n);")
    assert sm.foreign_keys(sql, "t") == [(["m", "s"], "pitch_shapes",
                                          ["method", "shape_id"])]


# --- the stats tables -------------------------------------------------------

STATS = ["hitter_shape_stats", "league_shape_stats", "hitter_shape_zone_stats"]


def test_migration_005_creates_the_three_stats_tables():
    sql = (MIGRATIONS / "005_stats.sql").read_text()
    assert sm.tables(sql) == STATS


def test_every_stats_table_is_keyed_by_method_then_season():
    # aggregate.py recomputes one (method, season) slice at a time, so that
    # slice has to be the leading edge of the key it deletes and rewrites.
    sql = (MIGRATIONS / "005_stats.sql").read_text()
    for table in STATS:
        assert sm.primary_key(sql, table)[:2] == ["method", "season"], table


def test_a_hitter_is_keyed_by_the_side_he_batted_from():
    # A switch-hitter is two rows. stand is a property of the pitch, not the
    # player, so it cannot be looked up later -- it has to be in the key.
    sql = (MIGRATIONS / "005_stats.sql").read_text()
    assert "stand" in sm.primary_key(sql, "hitter_shape_stats")
    assert "stand" in sm.primary_key(sql, "league_shape_stats")


def test_every_rate_is_stored_with_the_counts_behind_it():
    # The 75-pitch rule is applied at read time, so a rate with no denominator
    # on the row is a rate the app cannot decide whether to trust.
    sql = (MIGRATIONS / "005_stats.sql").read_text()
    for table in ("hitter_shape_stats", "league_shape_stats"):
        cols = sm.columns(sql, table)
        assert {"pitches_seen", "swings", "whiffs"} <= set(cols), table
        assert {"out_of_zone", "chases", "batted_balls"} <= set(cols), table


def test_the_stats_tables_reference_a_shape_by_method_and_id_together():
    # PLAN.md sketched `shape_id integer REFERENCES pitch_shapes(shape_id)`.
    # shape_id is text and is only unique within a method, so a single-column
    # FK would not even be creatable -- the reference must be composite.
    sql = (MIGRATIONS / "005_stats.sql").read_text()
    for table in STATS:
        assert (["method", "shape_id"], "pitch_shapes",
                ["method", "shape_id"]) in sm.foreign_keys(sql, table), table
