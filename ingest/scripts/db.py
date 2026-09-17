"""Single place every script gets a database connection from.

Two URLs on purpose: ingestion and migrations use the direct connection, the
Next.js app uses the pooled one. Day 6 changes nothing here.
"""

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def url(pooled: bool = False) -> str:
    key = "DATABASE_URL_POOLED" if pooled else "DATABASE_URL"
    value = os.environ.get(key, "").strip()
    if not value:
        raise SystemExit(f"{key} is empty — check {ROOT / '.env'}")
    return value


def connect(pooled: bool = False):
    return psycopg2.connect(url(pooled))


def safe_host(pooled: bool = False) -> str:
    """Hostname only — never the credential."""
    return url(pooled).split("@")[-1].split("/")[0]
