# Matchup Prep — ingestion pipeline
#
# Every step is safe to re-run. `make refresh` runs them in dependency order
# and stops on the first failure.

PY := ingest/.venv/bin/python
SEASON ?= 2026

.PHONY: refresh fetch migrate load players describe check test shapes-analyze shapes-choose shapes roster aggregate verify coverage

refresh: fetch migrate load players roster shapes aggregate	## full pipeline, in order

fetch:					## download Statcast into data/raw (skips cached weeks)
	$(PY) ingest/scripts/fetch.py --season $(SEASON)

migrate:				## apply pending SQL migrations
	$(PY) ingest/scripts/migrate.py

load:					## parquet -> pitches (upsert on natural key)
	$(PY) ingest/scripts/load_pitches.py --season $(SEASON)

players:				## fill player names from MLB StatsAPI
	$(PY) ingest/scripts/build_players.py

roster:				## Blue Jays active roster -> players.team / players.position
	$(PY) ingest/scripts/build_roster.py

describe:				## print random pitches as English sentences
	$(PY) ingest/scripts/describe_pitches.py --n 10

check:					## row counts and data-quality sanity checks
	$(PY) ingest/scripts/check.py

shapes-analyze:			## read-only: velocity distributions per pitch type (Task 9)
	$(PY) ingest/scripts/analyze_shapes.py --season $(SEASON)

shapes-choose:			## apply the banding rule -> db/shapes/v1_type_velo.json (Task 10)
	$(PY) ingest/scripts/choose_bands.py --season $(SEASON)

shapes: shapes-derive shapes-assign	## load the shape file and assign every pitch

shapes-derive:			## db/shapes/*.json -> pitch_shapes (validates the file first)
	$(PY) ingest/scripts/derive_shapes.py

shapes-assign:			## pitches -> shape_assignments (upsert; safe to re-run)
	$(PY) ingest/scripts/assign_shapes.py --season $(SEASON)

aggregate:			## recompute the three stats tables (full replace, re-runnable)
	$(PY) ingest/scripts/aggregate.py --season $(SEASON)

verify:				## re-count the Jays hitters in Python and compare to the SQL
	$(PY) ingest/scripts/verify_aggregate.py --season $(SEASON)

coverage:			## thin-cell audit: how much of the page is filled in (Task 15)
	$(PY) ingest/scripts/check_coverage.py --season $(SEASON)

test:				## unit tests for the pure statistics
	$(PY) -m pytest -q
