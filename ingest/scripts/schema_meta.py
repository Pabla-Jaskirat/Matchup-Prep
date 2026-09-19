"""Read table and primary-key structure back out of a migration file.

Used by the tests to assert that architectural decisions survive later edits.
It is a deliberately small regex reader, not a SQL parser: it understands the
subset of DDL these migrations actually use, and would rather return nothing
than guess.
"""

import re

CREATE = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(",
                    re.IGNORECASE)
TABLE_PK = re.compile(r"^\s*PRIMARY\s+KEY\s*\(([^)]*)\)", re.IGNORECASE | re.MULTILINE)
COLUMN_PK = re.compile(r"^\s*(\w+)\s+[\w()\s,]*?\bPRIMARY\s+KEY\b",
                       re.IGNORECASE | re.MULTILINE)


def strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


def tables(sql: str) -> list[str]:
    return CREATE.findall(strip_comments(sql))


def body(sql: str, table: str) -> str:
    """The text between the parentheses of one CREATE TABLE, by paren depth."""
    sql = strip_comments(sql)
    match = re.search(rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{table}\s*\(",
                      sql, re.IGNORECASE)
    if not match:
        return ""
    depth, start = 1, match.end()
    for i in range(start, len(sql)):
        depth += {"(": 1, ")": -1}.get(sql[i], 0)
        if depth == 0:
            return sql[start:i]
    return ""


def primary_key(sql: str, table: str) -> list[str]:
    inner = body(sql, table)
    if not inner:
        return []
    table_level = TABLE_PK.search(inner)
    if table_level:
        return [c.strip() for c in table_level.group(1).split(",")]
    column_level = COLUMN_PK.search(inner)
    return [column_level.group(1)] if column_level else []


FK = re.compile(r"FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+(\w+)\s*\(([^)]*)\)",
                re.IGNORECASE)
CONSTRAINT_START = re.compile(
    r"^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\b", re.IGNORECASE)


def _split_top_level(inner: str) -> list[str]:
    """Split a CREATE TABLE body on commas outside parentheses.

    numeric(5,4) and PRIMARY KEY (a, b) both contain commas that are not
    column separators.
    """
    parts, depth, start = [], 0, 0
    for i, ch in enumerate(inner):
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if ch == "," and depth == 0:
            parts.append(inner[start:i])
            start = i + 1
    parts.append(inner[start:])
    return [p.strip() for p in parts if p.strip()]


def columns(sql: str, table: str) -> list[str]:
    """Column names only -- table-level constraints are not columns."""
    return [p.split()[0] for p in _split_top_level(body(sql, table))
            if not CONSTRAINT_START.match(p)]


def foreign_keys(sql: str, table: str) -> list[tuple[list[str], str, list[str]]]:
    return [([c.strip() for c in cols.split(",")], ref,
             [c.strip() for c in ref_cols.split(",")])
            for cols, ref, ref_cols in FK.findall(body(sql, table))]
