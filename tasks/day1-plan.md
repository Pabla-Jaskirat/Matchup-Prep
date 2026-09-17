# Implementation Plan: Matchup Prep — Day 1 (Data Foundation)

## Overview

Day 1 ends with real 2026 Statcast pitch data sitting in a local Postgres table,
loadable repeatedly without duplicating rows, and a script that prints pitches as
English sentences so the vocabulary becomes concrete. No web app, no shapes, no
aggregates — those are Days 2–5. See `PLAN.md` for the full 7-day plan.

## Validated before planning

| Unknown | Result |
|---|---|
| Does pybaseball return 2026 data? | **Yes** — 1,342 rows for 2026-09-10 |
| Do Statcast column names match the schema? | **Yes** — all 23 required columns present (of 119) |
| Disk space | 24 GB free; full season ≈ 150 MB parquet, ≈ 250 MB in Postgres |
| Node / Python | Node 24.14, Python 3.12.3, venv + pybaseball 2.2.7 installed |
| Postgres | **NOT INSTALLED** — no psql, no Homebrew, no Docker. See Task 1. |

## Architecture decisions

- **Fetch and load are separate steps.** Fetch writes parquet to disk; load reads from
  disk. Network failures never cost you a re-download, and load can be re-run freely.
- **Natural primary key** `(game_pk, at_bat_number, pitch_number)` comes from the game
  itself, so re-loading the same pitch updates one row instead of inserting a second.
- **Only ~25 of 119 Statcast columns are stored.** The rest are noise for this tool.
- **Derived flags (`is_swing`, `is_whiff`, `in_zone`, `is_bip`) are GENERATED columns**,
  so "what counts as a swing" is defined once in the schema, not in each query.
- **Migrations are numbered SQL files** applied by a small runner, tracked in
  `schema_migrations`. Re-running applies nothing.
- **Fetch is the long pole and depends on nothing.** Start it first, let it run while
  the Postgres install and schema work happen in parallel.

## Dependency graph

```
Task 2 (fetch script) ──────────────┐   [no dependencies — START FIRST]
                                    │
Task 1 (install Postgres)           │
    │                               │
    └── Task 3 (db config + conn)   │
            │                       │
            └── Task 4 (migration runner + 001 players)
                    │               │
                    └── Task 5 (002 pitches + indexes)
                            │       │
                            └───────┴── Task 6 (load_pitches)
                                            │
                                            ├── Task 7 (describe_pitches)
                                            └── Task 8 (Makefile + .gitignore)
```

---

## Phase 1: Unblock and start the download

### Task 1: Get Postgres running locally

**Description:** No Postgres, Homebrew, or Docker on this machine. Postgres.app is the
lowest-friction Mac path: a download and a drag, no package manager, no sudo for the
server itself. Installing Homebrew first would cost an hour (it pulls Xcode CLT) and
buys nothing here.

**Acceptance criteria:**
- [ ] `psql --version` reports 16.x or later
- [ ] `pg_isready` reports the server is accepting connections
- [ ] A database named `matchup` exists

**Verification:**
- [ ] `psql -d matchup -c "select version();"` returns a version string

**Dependencies:** None
**Files likely touched:** none (environment only)
**Estimated scope:** XS — one download, one drag, one PATH line

**Human action required.** Steps:
1. Download from `postgresapp.com`, drag to Applications, open it, click Initialize.
2. Add its binaries to PATH:
   `echo 'export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"' >> ~/.zshrc`
3. Open a new terminal, then `createdb matchup`.

*Fallback if Postgres.app fails:* `pip install pgserver` runs a bundled Postgres with no
admin rights. Less standard, but unblocks the same day.

### Task 2: Fetch script — weekly parquet chunks, resumable

**Description:** `ingest/scripts/fetch.py` pulls Statcast in one-week chunks from the
2026 season start to today, writing one parquet file per chunk to
`data/raw/2026/<start-date>.parquet`. A chunk whose file already exists is skipped, so
an interrupted run resumes instead of restarting. Stores only the ~25 columns the
schema uses.

**Acceptance criteria:**
- [ ] `python ingest/scripts/fetch.py --season 2026` writes one parquet per week
- [ ] Re-running skips existing files and prints what it skipped
- [ ] `--force` re-downloads anyway
- [ ] Interrupting mid-run and restarting loses at most one chunk
- [ ] Total row count across chunks is in the 600k–750k range

**Verification:**
- [ ] `ls data/raw/2026/ | wc -l` shows ~25 files
- [ ] A short script summing `len(pd.read_parquet(f))` reports the total
- [ ] Run it twice; the second run downloads nothing

**Dependencies:** None — **start this before Task 1**
**Files likely touched:** `ingest/scripts/fetch.py`
**Estimated scope:** S

---

### Checkpoint: Phase 1
- [ ] Postgres accepting connections, `matchup` database exists
- [ ] Parquet files on disk, re-run downloads nothing
- [ ] Row count is in the expected range (a wildly low number means a bad date range)

---

## Phase 2: Schema

### Task 3: Database config and connection helper

**Description:** `.env` holding `DATABASE_URL`, and `ingest/scripts/db.py` exposing a
single `connect()` used by every later script. One place to change when Day 6 points
things at hosted Postgres.

**Acceptance criteria:**
- [ ] `.env` exists with `DATABASE_URL`, and `.env` is gitignored
- [ ] `.env.example` is committed with a placeholder
- [ ] `python -c "from db import connect; connect()"` succeeds

**Verification:**
- [ ] A connection test prints the server version

**Dependencies:** Task 1
**Files likely touched:** `.env`, `.env.example`, `ingest/scripts/db.py`
**Estimated scope:** XS

### Task 4: Migration runner and 001_players

**Description:** `ingest/scripts/migrate.py` applies numbered `.sql` files from
`db/migrations/` in filename order, recording each in a `schema_migrations` table and
skipping ones already applied. First migration creates `players`. Deliberately omits
batting hand — switch-hitters bat from the side opposite the pitcher, so batting side
is a property of the pitch, not the player.

**Acceptance criteria:**
- [ ] `python ingest/scripts/migrate.py` creates `schema_migrations` and applies 001
- [ ] Re-running reports "0 applied"
- [ ] `players` has `mlbam_id`, `full_name`, `throws`, `team`, `updated_at`
- [ ] Each migration runs in a transaction; a failing one rolls back and leaves no record

**Verification:**
- [ ] `psql -d matchup -c "\d players"` shows the expected columns
- [ ] Run twice; second run applies nothing

**Dependencies:** Task 3
**Files likely touched:** `ingest/scripts/migrate.py`, `db/migrations/001_players.sql`
**Estimated scope:** S

### Task 5: 002_pitches — the main table

**Description:** The `pitches` table per `PLAN.md`, including the four GENERATED
columns and both indexes. `stand` is stored per pitch, which is the switch-hitter fix.

**Acceptance criteria:**
- [ ] `pitches` exists with PK `(game_pk, at_bat_number, pitch_number)`
- [ ] `is_swing`, `is_whiff`, `in_zone`, `is_bip` are GENERATED ... STORED
- [ ] Both indexes exist
- [ ] `pitch_type` is nullable (Statcast has gaps); `stand` and `p_throws` are NOT NULL

**Verification:**
- [ ] Insert one fabricated `swinging_strike` row by hand; confirm `is_swing` and
      `is_whiff` both come back true without being set. Delete it.

**Dependencies:** Task 4
**Files likely touched:** `db/migrations/002_pitches.sql`
**Estimated scope:** S

---

### Checkpoint: Phase 2
- [ ] `migrate.py` is idempotent — second run applies nothing
- [ ] Generated columns verified by hand with a throwaway row
- [ ] Schema matches `PLAN.md`

---

## Phase 3: Load and see the data

### Task 6: load_pitches — parquet into Postgres, idempotently

**Description:** Reads each parquet file, renames Statcast columns to schema names
(`pitcher`→`pitcher_id`, `batter`→`batter_id`, `release_spin_rate`→`spin_rate`,
`release_extension`→`extension`, `estimated_woba_using_speedangle`→`est_woba`), COPYs
into an UNLOGGED staging table, then upserts into `pitches` with
`ON CONFLICT (game_pk, at_bat_number, pitch_number) DO UPDATE`. Staging is truncated
per file so a crash never leaves half-state.

**Acceptance criteria:**
- [ ] `python ingest/scripts/load_pitches.py` loads every parquet in `data/raw/2026/`
- [ ] `select count(*) from pitches` matches the parquet total
- [ ] **Running it a second time leaves the count unchanged**
- [ ] Rows with null `pitch_type` load rather than failing
- [ ] Loads in under 10 minutes

**Verification:**
- [ ] Record the count, re-run the whole loader, confirm the count is identical
- [ ] `select count(*) from pitches where stand is null` returns 0
- [ ] `select stand, count(*) from pitches group by stand` shows both L and R

**Dependencies:** Tasks 2, 5
**Files likely touched:** `ingest/scripts/load_pitches.py`
**Estimated scope:** M

### Task 7: describe_pitches — the understanding checkpoint

**Description:** Prints N random pitches as English sentences: *"Gausman (RHP) threw an
87.4 mph splitter to Judge (batting R) — swung and missed."* This is the Day 1 exit
criterion from `PLAN.md`: it exists so the row format stops being abstract.

**Acceptance criteria:**
- [ ] `python ingest/scripts/describe_pitches.py --n 10` prints 10 readable sentences
- [ ] Output names both players, the pitch, velocity, and what happened
- [ ] Handles null `pitch_type` without crashing

**Verification:**
- [ ] Run it. Read the output aloud. **Can you explain what one row represents?**
      If not, Day 2 does not start.

**Dependencies:** Task 6
**Files likely touched:** `ingest/scripts/describe_pitches.py`
**Estimated scope:** S

### Task 8: Makefile and .gitignore

**Description:** `make fetch`, `make migrate`, `make load`, and `make refresh` chaining
them in order. `.gitignore` covering `data/raw/`, `.venv`, `.env`, `node_modules`.

**Acceptance criteria:**
- [ ] `make refresh` runs fetch → migrate → load in order and stops on first failure
- [ ] `git status` shows no parquet files, no venv, no `.env`

**Verification:**
- [ ] `make refresh` on an already-populated database completes and changes no counts

**Dependencies:** Tasks 2, 6
**Files likely touched:** `Makefile`, `.gitignore`
**Estimated scope:** XS

---

### Checkpoint: Day 1 complete
- [ ] `select count(*) from pitches` returns ~700k
- [ ] The entire pipeline re-runs end to end and changes nothing
- [ ] Ten pitches print as English sentences
- [ ] **You can say out loud what one row of `pitches` represents**
- [ ] Committed to git

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Postgres install eats hours | **High** — blocks Tasks 3-8 | Postgres.app over Homebrew; `pgserver` fallback; fetch runs in parallel regardless |
| pybaseball rate-limits or fails mid-pull | Medium | Weekly chunks cached to disk; resume skips completed files; Savant CSV export as fallback |
| Statcast column names drift | Low | **Already validated** — all 23 needed columns present |
| Switch-hitters aggregated wrong | **High** — silently wrong output on Day 3 | `stand` stored per pitch and NOT NULL from the start |
| Day 1 slips and cascades | **High** — 7-day deadline | Fetch starts before anything else; heatmap already designated as the cut |
| Full-season row count comes back low | Medium | Checkpoint 1 explicitly checks the total is 600k–750k |

## Open questions

1. **Postgres.app, or the `pgserver` fallback?** Recommendation: Postgres.app. It gives
   you real `psql`, which you'll want on Days 2–3 for poking at the data by hand.
2. **Season start date for the fetch.** Defaulting to 2026-03-01 through today; empty
   early chunks cost seconds and guarantee nothing is missed.
