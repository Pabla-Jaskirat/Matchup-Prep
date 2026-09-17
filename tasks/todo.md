# Matchup Prep — Day 1 TODO

Full plan: `tasks/plan.md` · 7-day plan: `PLAN.md`

## Phase 1: Unblock and start the download

- [x] **Task 2: Fetch script** (S) — *no dependencies, START THIS FIRST*
  - [x] `ingest/scripts/fetch.py`, weekly chunks → `data/raw/2026/<date>.parquet`
  - [x] Skips chunks already on disk; `--force` overrides
  - [x] Stores only the ~25 columns the schema uses
  - [ ] Verify: run twice, second run downloads nothing
  - [ ] Verify: total rows across chunks is 600k–750k

- [x] **Task 1: Postgres running** (XS) — *human action*
  - [x] ~~Postgres.app~~ → **Neon** (hosted Postgres, us-east-1, project `Matchup-prep`)
  - [x] Connection strings in `.env` (direct + pooled), gitignored
  - [x] Verify: both connect, Postgres 18.6

- [x] **CHECKPOINT 1** — Postgres up, parquet on disk, row count sane

## Phase 2: Schema

- [x] **Task 3: DB config** (XS) — depends on 1
  - [x] `.env` + `.env.example` + `ingest/scripts/db.py`
  - [x] Verify: connection test prints server version

- [x] **Task 4: Migration runner + 001_players** (S) — depends on 3
  - [x] `migrate.py` applies numbered SQL, tracks in `schema_migrations`
  - [x] `001_players.sql` — no batting hand (switch-hitters)
  - [x] Verify: second run applies nothing

- [x] **Task 5: 002_pitches** (S) — depends on 4
  - [x] Table, natural PK, 4 GENERATED columns, 2 indexes
  - [x] Verify: insert a fake `swinging_strike`, confirm `is_whiff` is true, delete it

- [x] **CHECKPOINT 2** — migrations idempotent, generated columns proven by hand

## Phase 3: Load and see the data

- [x] **Task 6: load_pitches** (M) — depends on 2, 5
  - [x] Rename Statcast columns → schema names
  - [x] COPY into UNLOGGED staging, then upsert ON CONFLICT
  - [x] Verify: **re-run leaves `count(*)` unchanged** ← the important one
  - [x] Verify: no null `stand`; both L and R present

- [x] **Task 7: describe_pitches** (S) — depends on 6
  - [x] Prints N pitches as English sentences
  - [ ] Verify: read 10 aloud — **can you say what one row represents?**

- [x] **Task 8: Makefile + .gitignore** (XS) — depends on 2, 6
  - [x] `make fetch` / `migrate` / `load` / `refresh`
  - [x] Ignore `data/raw/`, `.venv`, `.env`, `node_modules`
  - [x] Verify: `git status` shows no parquet, no venv, no `.env`

- [ ] **CHECKPOINT 3 — Day 1 done**
  - [x] ~700k rows in `pitches`
  - [x] Whole pipeline re-runs and changes nothing
  - [ ] You can explain one row out loud
  - [x] Committed

## Deliberately NOT Day 1

Shapes, aggregates, league baseline, any web code, the heatmap.
