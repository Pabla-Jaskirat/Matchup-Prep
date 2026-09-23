# Matchup Prep — ingestion pipeline
#
# Every step is safe to re-run. `make refresh` runs them in dependency order
# and stops on the first failure.

PY := ingest/.venv/bin/python
SEASON ?= 2026
METHOD ?= v1_type_velo

.PHONY: refresh fetch migrate load players describe check test web-test web-build dev verify-matchup explainer reliability shapes-analyze shapes-choose shapes-choose-split retire-method shapes roster aggregate verify coverage

refresh: fetch migrate load players roster shapes aggregate explainer	## full pipeline, in order

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

shapes-choose:			## apply the shape rule -> db/shapes/<method>.json (Task 10)
	$(PY) ingest/scripts/choose_bands.py --season $(SEASON)

shapes-choose-split:		## rebuild the rejected velocity-band rule, for comparison
	$(PY) ingest/scripts/choose_bands.py --season $(SEASON) \
		--split-above-iqr 5.0 --method v1_type_velo

retire-method:			## drop a superseded method's rows (METHOD=v1_type_velo)
	$(PY) ingest/scripts/retire_method.py --method $(METHOD)

shapes: shapes-derive shapes-assign	## load the shape file and assign every pitch

shapes-derive:			## db/shapes/*.json -> pitch_shapes (validates the file first)
	$(PY) ingest/scripts/derive_shapes.py

shapes-assign:			## pitches -> shape_assignments (upsert; safe to re-run)
	$(PY) ingest/scripts/assign_shapes.py --season $(SEASON)

aggregate:			## recompute the three stats tables (full replace, re-runnable)
	$(PY) ingest/scripts/aggregate.py --season $(SEASON)

verify:				## re-count the Jays hitters in Python and compare to the SQL
	$(PY) ingest/scripts/verify_aggregate.py --season $(SEASON)

verify-matchup:			## check the matchup API against raw-pitch SQL (needs `make dev`)
	$(PY) ingest/scripts/verify_matchup.py

explainer:			## freeze the how-it-works numbers into web/data/explainer.json
	$(PY) ingest/scripts/build_explainer.py --season $(SEASON)

reliability:			## split-half test: do these numbers say anything true?
	$(PY) ingest/scripts/reliability.py --season $(SEASON)

coverage:			## thin-cell audit: how much of the page is filled in (Task 15)
	$(PY) ingest/scripts/check_coverage.py --season $(SEASON)

test: web-test			## unit tests: the pure statistics, then the web app
	$(PY) -m pytest -q

web-test:			## unit tests for web/lib (node's built-in runner)
	cd web && npm test

web-build:			## production build; fails on any TypeScript error
	cd web && npm run build

dev:				## run the Next.js app at localhost:3000
	cd web && npm run dev
