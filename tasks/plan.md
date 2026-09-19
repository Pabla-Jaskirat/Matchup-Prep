# Implementation Plan: Matchup Prep — Days 2 to 7

Day 1 is complete and committed. Its plan is preserved at `tasks/day1-plan.md`.
Full 7-day context: `PLAN.md`.

## Where we are

| Fact | Value |
|---|---|
| Pitches loaded | 696,100 (2026 season to date) |
| Players named | 2,525 / 2,525 |
| Database | Neon Postgres 18.6, us-east-1, 216 MB of 500 MB |
| Migrations applied | 001_players, 002_pitches |
| Pipeline | `make refresh` re-runs clean, adds 0 rows |

## Validated before planning (read-only probes, this session)

| Unknown | Result | Effect on the plan |
|---|---|---|
| How many `(hand, pitch_type)` groups clear 5,000 pitches? | **16** | At 2–3 bands each → **32–48 shapes**. Confirms `PLAN.md`'s ~40–55 estimate without guessing. |
| Can we identify the nine Blue Jays hitters? | **No — `players.team` is 100% NULL** | New blocking task. See below. |
| Does MLB StatsAPI expose a roster? | **Yes** — `/api/v1/teams/141/roster?rosterType=active` returns 28 players with positions | Fixes the above. 14 non-pitchers = the hitter pool. |

### The gap worth naming

`build_players.py` asks StatsAPI for `currentTeam.abbreviation`, but that endpoint
returns `currentTeam: null` unless the request is hydrated. Every row silently got
`team = NULL`. Nothing failed, no check caught it, because Day 1's checks never
asserted on team — team wasn't needed until Day 4.

This is worth understanding rather than just patching: **an API that returns 200 with
a missing field looks identical to one that returns the field empty.** The fix is not
hydration — it is a narrower request. We don't need every player's team; we need one
team's roster. Task 16 calls the roster endpoint directly, which is both correct and
a smaller thing to explain.

## Architecture decisions for this stretch

- **The band decision is recorded as data, not code.** Task 10 writes
  `db/shapes/v1_type_velo.json`. `derive_shapes.py` reads it. Changing a band on Day 3
  is a JSON edit and a re-run, not a code change — which matters because Day 3 may
  well tell us to widen them.
- **`aggregate` fully recomputes a `(method, season)` slice.** Delete-then-insert at
  700k rows takes seconds and is far easier to prove correct than incremental updates.
- **The web app never queries `pitches`.** Every API route reads a stats table whose
  primary key already matches the lookup. This is a stated talking point, so the code
  has to actually honour it.
- **Search before matchup.** Task 18 is the first end-to-end vertical slice: browser →
  API → Postgres → rendered result. It is deliberately the *simplest* such slice, so
  that when it breaks, the bug is in the plumbing and nowhere else.
- **Pooled connection string in Next.js, direct in Python.** Serverless functions open
  many short-lived connections; that is what the pooler exists for.

## Dependency graph

```
Task 9  (analyze_shapes, read-only)
    │
    └── Task 10 (HUMAN: choose bands -> v1_type_velo.json)
            │
Task 11 (migration 003: shapes tables)
            │
            └── Task 12 (derive_shapes + assign_shapes)
                    │
Task 13 (migration 004: stats tables)
                    │
                    └── Task 14 (aggregate)
                            │
                            ├── Task 15 (thin-cell audit -> maybe widen bands, loop to 10)
                            │
Task 16 (Jays roster)       │
            │               │
            └───────────────┴── Task 17 (Next.js scaffold + /api/health)
                                    │
                                    ├── Task 18 (pitcher search, full vertical slice)
                                    │       │
                                    │       └── Task 19 (matchup API + main screen)
                                    │               │
                                    │               └── Task 20 (detail view, empty states, phone)
                                    │                       │
                                    │                       ├── Task 21 (deploy)
                                    │                       ├── Task 22 (README)
                                    │                       └── Task 23 (rehearsal)
                                    │
                                    └── Task 24 (heatmap — OPTIONAL, first to cut)
```

Task 16 has no data dependencies and can be done any time it is convenient. It is
placed in Phase 2 only so Phase 3 is never blocked on it.

---

## Phase 1 — Shapes exist (Day 2)

### Task 9: `analyze_shapes.py` — look before bucketing

**Description:** A read-only script that prints, for every `(p_throws, pitch_type)`
pair with at least 5,000 pitches, the velocity distribution and movement profile. It
changes nothing in the database. Its entire purpose is to produce the numbers a human
needs in order to choose band boundaries defensibly.

Multiply `pfx_x` by −1 for LHP before printing, so horizontal break means the same
thing in both handedness rows. Without this, comparing a lefty slider to a righty
slider compares a number to its own negative.

**Acceptance criteria:**
- [ ] Prints per group: n, velocity p10/p25/p50/p75/p90, IQR, mean `pfx_x`, mean `pfx_z`
- [x] Prints a text histogram of velocity per group, outer 1% tails clipped
- [ ] Flags bimodality and prints the velocity↔`pfx_x` correlation
- [ ] `pfx_x` sign-normalised for LHP
- [ ] Writes nothing to the database

**Verification:**
- [ ] `make shapes-analyze` prints 16 groups (probed count — a different number means
      the pitch mix or threshold changed, and that is worth understanding before continuing)
- [x] ~~RHP `SL` shows a wider IQR than RHP `CH`~~ — **falsified.** SL IQR 3.5, CH IQR 4.3.
      The query was checked and is correct; the expectation was wrong. Widest groups are
      RHP KC 6.2, CU 5.6, FS 5.1. See PLAN.md Step C.
- [ ] Re-run produces byte-identical output

**Dependencies:** None
**Files:** `ingest/scripts/analyze_shapes.py`, `Makefile`
**Scope:** S

---

### Task 10: Choose the velocity bands — human decision

**Description:** Read Task 9's output and apply the rule from `PLAN.md`:

- IQR < 2.5 mph → **one band**
- IQR 2.5–5.0 mph → **two bands**, split at the median
- IQR > 5.0 mph → **three bands**, split at p33 / p67
- Collapse any resulting band under 5,000 league pitches into its neighbour

Record the result in `db/shapes/v1_type_velo.json`, each entry carrying the percentile
it came from, so the file is self-documenting.

**This decision belongs to you, not to me.** It is the one a reviewer will ask you to
defend, and the answer has to be yours. The rule above makes it mechanical; the
judgment is in noticing where the rule produces something silly and overriding it
on purpose.

**Acceptance criteria:**
- [ ] `db/shapes/v1_type_velo.json` exists, covering all 16 groups
- [ ] Every boundary traces to a printed percentile
- [ ] Total shape count lands between 32 and 48
- [ ] Any manual override carries a one-line `note` field saying why

**Verification:**
- [ ] Read the file top to bottom and say out loud why sliders got more bands than changeups
- [ ] No band spans fewer than 5,000 league pitches

**Dependencies:** 9
**Files:** `db/shapes/v1_type_velo.json`
**Scope:** XS (but it is the day's real work)

---

### Task 11: Migration `003_shapes.sql`

**Description:** `pitch_shapes` and `shape_assignments` exactly as specified in
`PLAN.md`, including `method` in both primary keys.

**Acceptance criteria:**
- [x] `pitch_shapes` with `UNIQUE (method, p_throws, pitch_type, velo_min)` — **missed in
      003 and added afterwards as `004_shape_band_unique.sql`.** It also needed
      `NULLS NOT DISTINCT`, which the original criterion did not say: every group's
      slowest band has `velo_min` NULL, and Postgres treats two NULLs as different
      values, so the plain constraint would have allowed the duplicate it exists to stop.
- [x] `shape_assignments` with `PRIMARY KEY (method, game_pk, at_bat_number, pitch_number)`
      and a composite FK to `pitches` with `ON DELETE CASCADE`
- [x] Index on `(method, shape_id)` — named `shape_assignments_shape_idx`

**Verification:**
- [x] `make migrate` applies it; a second run applies nothing
- [x] Inserting a `shape_assignments` row for a nonexistent pitch is rejected by the FK
- [x] Inserting a second open-bottom band for one group is rejected by 004

**Dependencies:** None
**Files:** `db/migrations/003_shapes.sql`
**Scope:** S

---

### Task 12: `derive_shapes.py` + `assign_shapes.py`

**Description:** `derive_shapes` reads the JSON and writes `pitch_shapes` for
`method = 'v1_type_velo'`, generating human labels like `RHP Hard Slider (87-91)`.
`assign_shapes` does one `INSERT … SELECT` joining `pitches` to `pitch_shapes` on
handedness, pitch type, and a velocity range, and upserts.

Band ranges must be half-open (`velo_min <= speed < velo_max`) so a pitch at a boundary
lands in exactly one band. Closed ranges on both ends will double-assign and the
primary key will reject it — which is the schema catching the bug for you.

**Acceptance criteria:**
- [x] Both steps re-runnable. `derive_shapes` upserts rather than deleting first, as
      planned: a delete would break `shape_assignments`' FK, and the unique constraint
      from 004 makes the upsert just as safe.
- [x] Pitches with `pitch_type IS NULL` (0.41% of rows) are left unassigned, not bucketed
- [x] Unassigned pitches are counted and reported by group, and the report separates an
      expected miss (a type under the 5,000 floor) from an unexpected one (a band gap)
- [x] `make shapes` runs derive then assign; `make refresh` now includes it

**Verification:**
- [x] 33 shapes for `v1_type_velo` — inside the 32–48 range
- [x] 683,797/693,241 typed pitches assigned (**98.6%**)
- [x] Re-run wrote the same 683,797 rows; counts unchanged
- [x] Spot-check: 5 pitches from `R-CU-2` all inside [78.9, 82.6). Then the exhaustive
      version — **0 of 683,797 assigned pitches sit outside their own band** on speed,
      hand or type — and it is now a permanent `make check` assertion
- [x] `make check` passes, with three new shape assertions

**Dependencies:** 10, 11
**Files:** `ingest/scripts/derive_shapes.py`, `ingest/scripts/assign_shapes.py`, `Makefile`
**Scope:** M

---

### Checkpoint A — Day 2 done
- [x] One query lists every shape with its pitch count; all 33 DB counts equal the JSON
- [x] `make refresh` now includes `shapes`; each step verified idempotent individually
      (a full `fetch` re-run was not repeated — it re-downloads 179 game dates)
- [x] ~~Database still under 350 MB~~ — **missed by 2 MB: 352 MB.** `shape_assignments`
      cost 136 MB (79 heap + 57 index), not the ~80 MB estimated in the risk table
      below. 148 MB of headroom remains and the Task 13 tables are aggregates, so
      no action taken.
- [ ] **Say it out loud:** why sliders got more bands than changeups
- [ ] Committed

---

## Phase 2 — The answer exists in SQL (Day 3)

### Task 13: Migration `005_stats.sql`

**Description:** `hitter_shape_stats`, `league_shape_stats`, and
`hitter_shape_zone_stats` per `PLAN.md`. No extra indexes — the primary keys already
match every lookup the app performs.

**Acceptance criteria:**
- [x] Three tables, each with `method` and `season` leading the primary key
- [x] Raw counts stored alongside every rate, so the 50-pitch rule is enforceable at read time
- [x] FKs to `pitch_shapes` — **composite `(method, shape_id)`, not the single-column FK
      PLAN.md sketched.** `shape_id` is text and is unique only within a method, so
      `REFERENCES pitch_shapes(shape_id)` could not have been created at all.
      `batter_id` also gained an FK to `players`.

**Verification:**
- [x] `make migrate` applies it; second run applies nothing (`0 applied, 5 already present`)
- [x] Live keys and FKs on all three tables match the file; database still 352 MB (empty tables)

**Dependencies:** None (but useless before 12)
**Files:** `db/migrations/005_stats.sql`
**Scope:** S

---

### Task 14: `aggregate.py`

**Description:** Full recompute of all three stats tables for a `(method, season)`
slice: delete that slice, then `INSERT … SELECT` from `pitches` joined to
`shape_assignments`.

Two things must be right:

- **Chase rate excludes untracked pitches.** `in_zone` is NULL for ~0.41% of rows.
  The denominator is `count(*) FILTER (WHERE in_zone IS FALSE)`, never
  `count(*) - count(in_zone)`. Treating unknown as out-of-zone inflates the denominator
  and quietly deflates every chase rate on the page.
- **`stand` is part of the group-by.** A switch-hitter is two rows, not one.

**Acceptance criteria:**
- [x] All three tables populated: **23,742** hitter rows, **66** league rows, **3,834**
      zone rows. The zone table is restricted to the Jays hitter pool — league-wide it
      would be ~300,000 rows for a view that is optional and first to cut.
- [x] Both rates NULL when the denominator is 0, never 0.0 — a hitter who never swung
      has no whiff rate, and printing 0% would read as "he never misses"
- [x] Re-run is **byte-identical**: same row counts and the same md5 over the whole table
- [x] Reconciles exactly: 0 league rows disagree with the sum of their hitter rows

**Verification:**
- [x] Reconciliation is now a `check.py` assertion, alongside an impossible-rates check
      (whiffs > swings, chases > out_of_zone, any rate > 1)
- [x] Brandon Valenzuela appears with both `stand = 'L'` and `stand = 'R'`
- [x] Guerrero: 2,053 `pitches_seen` across shapes vs 2,091 rows in `pitches` (98.2%);
      the difference is pitch types with no shape
- [x] **Stronger than planned:** `verify_aggregate.py` pulls each Jays hitter's raw
      pitches back out and re-counts them with an independent Python implementation,
      comparing every field. **14 hitters, 447 rows, 0 mismatches.** The first run
      found 42 real disagreements — see below.

**What the cross-check caught.** The first comparison disagreed on 42 of 447 rows,
always by one unit in the last decimal place, always with SQL higher. Postgres rounds
a half away from zero; Python's `round()` rounds it to the nearest even digit, so
73.05 is 73.1 in SQL and 73.0 in Python. The stored values were right and the
reference implementation was wrong; it now uses `Decimal` with `ROUND_HALF_UP`, and
two tests pin the behaviour. A difference that small is exactly the kind that reads
as noise and is actually two implementations disagreeing.

**Dependencies:** 12, 13
**Files:** `ingest/scripts/aggregate.py`, `ingest/scripts/verify_aggregate.py`,
`ingest/scripts/check.py`, `Makefile`
**Scope:** M

---

### Task 15: Thin-cell audit — and the decision it forces

**Description:** Count how many `(batter, stand, shape)` cells fall below 75 pitches,
restricted to the Blue Jays hitter pool, since those are the only cells that ever
reach the screen. Print the distribution.

**If too many Jays cells are thin, the lever is wider bands — not more data.** A second
season is ruled out on storage (216 MB of 500 MB already). Widening means editing
`v1_type_velo.json` and re-running Tasks 12 and 14, which is exactly why the bands live
in a JSON file.

There is no single "too many" number. The question to ask of the output is: *would a
coach opening this page see mostly numbers, or mostly "not enough data"?* If a typical
Jays hitter has fewer than about 4 usable shapes against a typical starter's arsenal,
the tool doesn't answer its own question yet.

**Acceptance criteria:**
- [ ] Prints, for the Jays hitter pool: cells total, cells ≥ 75, median usable shapes per hitter
- [ ] Prints the same for a typical 4-pitch arsenal, which is the real-world case
- [ ] A written decision recorded in `PLAN.md`: bands kept, or bands widened and why

**Verification:**
- [ ] If bands were widened, Tasks 12 and 14 were re-run and Checkpoint A's criteria still hold

**Dependencies:** 14, 16
**Files:** `ingest/scripts/check_coverage.py`, `PLAN.md`
**Scope:** S

---

### Task 16: Blue Jays roster

**Description:** `players.team` is entirely NULL (see the gap noted above). Fetch the
Blue Jays active roster from `/api/v1/teams/141/roster?rosterType=active` and record it.
Non-pitchers form the hitter pool the main screen iterates over.

Store `team` and `position` on `players` via migration `005`, rather than hardcoding a
list of names. A hardcoded list is a thing a reviewer notices.

**Acceptance criteria:**
- [x] Migration **`006_roster.sql`** (005 went to the stats tables) adds `position text`
      to `players`, plus an index on `(team, position)` — the main screen's first query
- [x] `build_roster.py` upserts all 28 roster entries with `team = 'TOR'` and position
- [x] Re-runnable in both directions: a call-up is upserted, and anyone still recorded
      as a Blue Jay but no longer listed has `team` and `position` cleared. It also
      refuses to act on an empty roster response rather than clearing the whole team.
- [x] `make roster` exists and runs in `make refresh`, after `players`

**Verification:**
- [x] **Exactly 14** non-pitchers with `team = 'TOR'`
- [x] All 14 have pitches on file, from Sean Keys (235) to Kazuma Okamoto (2,518).
      Two *pitchers* have none — Brendan Cellucci and José Rodríguez, both recent
      additions — which is expected and does not affect the hitter pool.
- [x] `check.py` asserts the pool is 9–20, and separately that no Jays hitter has
      zero pitches on file

**Dependencies:** None
**Files:** `db/migrations/005_roster.sql`, `ingest/scripts/build_roster.py`, `Makefile`, `ingest/scripts/check.py`
**Scope:** S

---

### Checkpoint B — Day 3 done
- [ ] One SQL query, given a pitcher id, returns nine hitters × that pitcher's shapes with rates, counts, and league deltas
- [ ] That query touches only the stats tables and `pitch_shapes` — never `pitches`
- [ ] It returns in under 100 ms
- [ ] **Say it out loud:** why 75, and what the league table is for
- [ ] Committed

**This is the most important checkpoint in the project.** Everything after it is
presentation. If the query is right, the remaining days cannot fail quietly; if it is
wrong, a working website will display wrong answers convincingly.

---

## Phase 3 — It's a website (Days 4–5)

### Task 17: Next.js scaffold + database client + `/api/health`

**Description:** Next.js App Router with TypeScript in `web/`, a single Postgres client
module using **`DATABASE_URL_POOLED`**, and one trivial route proving the connection
works from a Next.js server context.

Do this before any UI. A connection problem found through a blank health route takes
two minutes to diagnose; the same problem found through a broken page takes an hour.

**Acceptance criteria:**
- [ ] `web/` builds and runs with `npm run dev`
- [ ] `web/lib/db.ts` is the only place a connection is created
- [ ] `/api/health` returns `{ ok: true, pitches: 696100 }`
- [ ] `.env.local` gitignored; `web/.env.example` committed

**Verification:**
- [ ] `curl localhost:3000/api/health` returns the row count
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `git status` shows no `.env.local`, no `node_modules`

**Dependencies:** 16
**Files:** `web/` scaffold, `web/lib/db.ts`, `web/app/api/health/route.ts`, `.gitignore`
**Scope:** M

---

### Task 18: Pitcher search — the first full vertical slice

**Description:** `/api/pitchers/search?q=` using the trigram index from migration 001,
plus a search box that renders results. Browser → API → Postgres → screen, on the
simplest possible payload.

Restrict results to pitchers with enough 2026 pitches to have a real arsenal (say 200),
so typing "sm" doesn't return forty position players who threw one mop-up inning.

**Acceptance criteria:**
- [ ] Case-insensitive, handles accents (`Andrés`), tolerates partial words
- [ ] Returns id, name, throws, 2026 pitch count; capped at 10
- [ ] Empty query returns empty, not an error
- [ ] Search box works with a keyboard alone

**Verification:**
- [ ] Typing "sku" returns Skubal; typing "zzz" returns an empty state, not a crash
- [ ] `EXPLAIN` shows the trigram index in use
- [ ] Works at 390px wide

**Dependencies:** 17
**Files:** `web/app/api/pitchers/search/route.ts`, `web/app/page.tsx`, `web/components/PitcherSearch.tsx`
**Scope:** M

---

### Task 19: Matchup API + main screen

**Description:** `/api/matchup/[pitcherId]` returns the pitcher's arsenal (shapes above
a usage floor) and, for each Jays hitter, their stat line per shape with the league
delta. The main screen renders the layout sketched in `PLAN.md`: the "tonight's edge"
banner, then hitters with a per-shape marker each.

The 50-pitch rule is applied **in the API**, which returns a discriminated result per
cell — a value, or a reason it has none. If the rule lives in the component, the next
component will forget it.

**Acceptance criteria:**
- [ ] Arsenal = shapes the pitcher threw at least 3% of the time (avoids a one-off pitch appearing as a column)
- [ ] Each cell is `{ kind: 'value', … }` or `{ kind: 'insufficient', pitches_seen }`
- [ ] "Tonight's edge" computed server-side: the shape with the most weak hitters
- [ ] Unknown pitcher id returns 404 with a usable message
- [ ] Main screen renders nine hitters without scrolling sideways at 390px

**Verification:**
- [ ] Pick three real pitchers; every marker matches a hand-run SQL query
- [ ] No route queries `pitches`
- [ ] Response under 300 ms warm

**Dependencies:** 18
**Files:** `web/app/api/matchup/[pitcherId]/route.ts`, `web/app/matchup/[pitcherId]/page.tsx`, `web/components/HitterRow.tsx`, `web/lib/thresholds.ts`
**Scope:** M

---

### Task 20: Hitter detail view, empty states, phone width

**Description:** Tap a hitter, expand to the per-shape detail from `PLAN.md`: absolute
rate, league comparison in words, pitch count, and for thin shapes the sentence saying
why there is no number.

The empty state is a feature, not a fallback. It reads "Not enough data — 41 pitches
seen, below the 50 threshold," because that sentence is what tells a reviewer the
restraint was deliberate.

**Acceptance criteria:**
- [ ] Detail view reachable and dismissable by tap and by keyboard
- [ ] League comparison rendered as words, never a percentile
- [ ] Every rate shows its pitch count
- [ ] Whole flow works at 390px on a real phone
- [ ] Loading states present; no layout shift on data arrival

**Verification:**
- [ ] Open it on your actual phone over local network and complete the flow
- [ ] Find a hitter with a genuinely thin shape and confirm the sentence reads correctly
- [ ] Lighthouse accessibility ≥ 90

**Dependencies:** 19
**Files:** `web/components/HitterDetail.tsx`, `web/app/globals.css`
**Scope:** M

---

### Checkpoint C — Days 4–5 done
- [ ] Pick a pitcher, see nine hitters, tap one, see why — on a phone
- [ ] `npm run build` clean
- [ ] **Say it out loud:** why the page never queries `pitches`; why location isn't part of the shape
- [ ] Committed

---

## Phase 4 — Ship it (Days 6–7)

### Task 21: Deploy to Vercel

**Description:** Connect the repo, set the pooled connection string as an environment
variable, deploy to `iad1` (same region as the Neon project, chosen on Day 1 for
exactly this).

Neon auto-suspends when idle and wakes on the next connection. The first request after
a quiet week will be slow. Verify the wake path works rather than assuming it does —
a hiring manager opening a dead link is the failure mode this whole hosting choice
was made to avoid.

**Acceptance criteria:**
- [ ] Production URL loads and completes the full flow
- [ ] `DATABASE_URL_POOLED` set in Vercel; no secret in the repo
- [ ] Cold start after idle returns data rather than erroring

**Verification:**
- [ ] Open the URL on a phone on cellular data, not home wifi
- [ ] Wait for suspend, then load again and confirm it wakes
- [ ] `git log -p | grep -i "postgresql://"` finds nothing

**Dependencies:** 20
**Files:** `vercel.json` if needed, `README.md`
**Scope:** S

---

### Task 22: README

**Description:** The six sections in `PLAN.md`, in that order. The README is what a
hiring manager reads in the 90 seconds before deciding whether to open the app.

Section 3 frames shape-matching as **the standard industry approach** — Stuff+,
PitchingBot — never as an invention. Section 6 closes with movement clustering as the
known next step, citing the bimodality evidence Task 9 produced. Naming the limitation
yourself is stronger than having it found.

**Acceptance criteria:**
- [ ] All six sections present, in order
- [ ] Opens with what it does, in three lines, above any setup instructions
- [ ] One screenshot of the main screen
- [ ] Real numbers from the build: pitch count, shape count, thin-cell rate
- [ ] Setup instructions someone else could actually follow

**Verification:**
- [ ] Read it cold, timed: under 90 seconds to the point
- [ ] Every number in it re-derived from the database rather than remembered

**Dependencies:** 21
**Files:** `README.md`
**Scope:** S

---

### Task 23: Rehearse the two-minute explanation

**Description:** Success criterion #3 from the confirmed intent, and the one that is
actually load-bearing: explain the shape-matching idea out loud, unaided, in about
two minutes. The project exists to get you through an interview, not to sit in a repo.

Cover, in order: why batter-vs-pitcher history fails; what a shape is; why that turns
11 pitches into thousands; why numbers disappear below 75; what you'd do next and why
you didn't do it yet.

**Acceptance criteria:**
- [ ] Delivered start to finish, no notes, twice
- [ ] Handles "isn't this just BvP with extra steps?" without hesitating
- [ ] Handles "why not include location?" with the sample-size answer
- [ ] Handles "what's wrong with it?" — the honest answer is velocity bands are a
      crude proxy for movement, and you know that

**Verification:**
- [ ] Record yourself once and watch it back
- [ ] Any sentence you can't explain a level deeper gets cut or learned

**Dependencies:** 22
**Files:** None
**Scope:** XS — and the highest-value task in the plan

---

### Task 24: Zone heatmap — OPTIONAL

**Description:** `hitter_shape_zone_stats` rendered as the 3×3 grid in the detail view.
**This is the first thing to cut.** It lands only if Tasks 9–23 are genuinely done.

Zone cells are small — per hitter, per shape, per zone. Most will be below threshold.
Show the grid only when the shape as a whole clears 75, and grey individual cells that
don't clear a lower zone-level floor.

**Acceptance criteria:**
- [ ] Aggregation extended to `hitter_shape_zone_stats`
- [ ] Grid renders from the catcher's view, consistently, and says so on screen
- [ ] Sparse cells greyed, not shown as 0%

**Verification:**
- [ ] One hitter's grid matches a hand-run SQL query
- [ ] Readable at 390px

**Dependencies:** 20
**Files:** `ingest/scripts/aggregate.py`, `web/components/ZoneGrid.tsx`
**Scope:** M

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Too many Jays cells below 75 pitches | **High** — the tool shows mostly empty states | Task 15 measures it explicitly; bands live in JSON so widening is an edit and a re-run |
| Neon free tier hits 500 MB | High | **Measured at Checkpoint A: 352 MB.** `shape_assignments` cost 136 MB, not the ~80 MB estimated — the repeated `method` text and two indexes on 684k rows. 148 MB headroom. If it tightens, drop `spin_rate`/`extension`/`plate_x`/`plate_z` — stored but unused in v1 |
| Day 4 is the first Next.js code in the project | Medium | Task 17 proves the connection before any UI; Task 18 is the smallest possible full slice |
| Vercel cold start on a suspended Neon branch | Medium | Task 21 explicitly tests the wake path rather than assuming it |
| Bands get widened on Day 3, invalidating Day 2's work | Low | Anticipated by design — Tasks 12 and 14 are both idempotent re-runs |
| The build works but the explanation doesn't | **High** — it is the stated success criterion | Task 23 is a real task with real acceptance criteria, not a footnote |

## Open questions

1. **Arsenal usage floor** — 3% is a guess. Task 19 should print the arsenal for a few
   real starters and confirm the floor produces 3–5 shapes, not 8.
2. **How many hitters on the main screen?** The roster's non-pitchers are ~14; a lineup
   is 9. Showing all 14 avoids pretending to know tonight's lineup. Decide at Task 19.
3. **Contact-quality threshold** — `PLAN.md` says "higher than 75" for `avg_est_woba`
   without a number. Batted balls are far rarer than pitches; 75 pitches might be 15
   batted balls. Pick a separate floor at Task 14 and write it down.
