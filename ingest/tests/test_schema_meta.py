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
