# Matchup Prep — ingestion pipeline
#
# Every step is safe to re-run. `make refresh` runs them in dependency order
# and stops on the first failure.

PY := ingest/.venv/bin/python
SEASON ?= 2026

.PHONY: refresh fetch migrate load players describe check test shapes-analyze

refresh: fetch migrate load players	## full pipeline, in order

fetch:					## download Statcast into data/raw (skips cached weeks)
	$(PY) ingest/scripts/fetch.py --season $(SEASON)

migrate:				## apply pending SQL migrations
	$(PY) ingest/scripts/migrate.py

load:					## parquet -> pitches (upsert on natural key)
	$(PY) ingest/scripts/load_pitches.py --season $(SEASON)

players:				## fill player names from MLB StatsAPI
	$(PY) ingest/scripts/build_players.py

describe:				## print random pitches as English sentences
	$(PY) ingest/scripts/describe_pitches.py --n 10

check:					## row counts and data-quality sanity checks
	$(PY) ingest/scripts/check.py

shapes-analyze:			## read-only: velocity distributions per pitch type (Task 9)
	$(PY) ingest/scripts/analyze_shapes.py --season $(SEASON)

test:				## unit tests for the pure statistics
	$(PY) -m pytest -q
