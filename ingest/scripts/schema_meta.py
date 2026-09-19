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
