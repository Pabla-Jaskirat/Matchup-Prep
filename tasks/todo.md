# Matchup Prep — TODO (Days 2–7)

Plan: `tasks/plan.md` · 7-day context: `PLAN.md` · Day 1 archive: `tasks/day1-todo.md`

**Done:** Day 1 — 696,100 pitches, 2,525 players, migrations 001–002, `make refresh`
idempotent, 8 commits.

---

## Phase 1: Shapes exist (Day 2)

- [x] **Task 9: `analyze_shapes.py`** (S) — DONE
  - [x] Per `(p_throws, pitch_type)` ≥ 5,000: n, velo p10/p25/p50/p75/p90, IQR, mean `pfx_x`/`pfx_z`
  - [x] Text histogram + bimodality flag + velo↔`pfx_x` correlation
  - [x] `pfx_x` × −1 for LHP before comparing across handedness
  - [x] Verify: 16 groups printed. **RHP SL IQR 3.5 < RHP CH 4.3 — expectation
        falsified, query verified correct.** No group is bimodal. See PLAN.md Step C.
  - [x] Verify: writes nothing to the database

- [x] **Task 10: Choose the bands** (XS) — DONE — `make shapes-choose`
  - [x] IQR <2.5 → 1 band · 2.5–5.0 → 2 at median · >5.0 → 3 at p33/p67
  - [x] Collapse any band under 5,000 pitches into its neighbour
  - [x] Write `db/shapes/v1_type_velo.json`, each boundary tagged with its percentile
  - [x] Verify: **33 shapes**, in range. RHP KC needed no hand call — the collapse
        rule cut it from 3 bands to 1 on its own. Thinnest band 6,407 (RHP FS under 85).
  - [ ] Verify: **say out loud why curveballs and splitters got more bands than sliders**
        ← *still yours to do, out loud, before Day 3*

- [x] **Task 11: Migration `003_shapes.sql`** (S) — DONE
  - [x] `pitch_shapes` + `shape_assignments`, `method` leads both PKs
  - [x] Verify: second `make migrate` applies nothing (`0 applied, 3 already present`)
  - [x] Verify: live constraints match the file; both FKs cascade; DB still 216 MB

- [ ] **Task 12: `derive_shapes` + `assign_shapes`** (M) — depends on 10, 11
  - [ ] Half-open bands (`velo_min <= speed < velo_max`) — closed bands double-assign
  - [ ] Null `pitch_type` left unassigned; velocity outliers counted, not dropped silently
  - [ ] Verify: ≥97% of typed pitches assigned
  - [ ] Verify: **re-run changes no counts**

- [ ] **CHECKPOINT A — Day 2 done**
  - [ ] Query lists every shape with its count
  - [ ] Database under 350 MB
  - [ ] Committed

---

## Phase 2: The answer exists in SQL (Day 3)

- [ ] **Task 13: Migration `004_stats.sql`** (S)
  - [ ] Three stats tables; counts stored beside every rate

- [ ] **Task 16: Blue Jays roster** (S) — *no dependencies, do it whenever*
  - [ ] `players.team` is currently **100% NULL** — StatsAPI returned `currentTeam: null`
  - [ ] Migration `005_roster.sql` adds `position`; `build_roster.py` uses `/teams/141/roster`
  - [ ] Verify: ~14 non-pitchers with `team='TOR'`, each with pitches on file

- [ ] **Task 14: `aggregate.py`** (M) — depends on 12, 13
  - [ ] Chase denominator is `FILTER (WHERE in_zone IS FALSE)` — NULL is not out-of-zone
  - [ ] `stand` in the group-by — a switch-hitter is two rows
  - [ ] Verify: hitter rows sum to league rows per `(stand, shape_id)` — added to `check.py`
  - [ ] Verify: re-run produces identical values

- [ ] **Task 15: Thin-cell audit** (S) — depends on 14, 16
  - [ ] Median usable shapes per Jays hitter against a 4-pitch arsenal
  - [ ] Decision written into `PLAN.md`: bands kept, or widened and why
  - [ ] If widened: re-run 12 and 14

- [ ] **CHECKPOINT B — Day 3 done** ← *the one that matters*
  - [ ] One query: pitcher id → 9 hitters × shapes, with counts and league deltas
  - [ ] It never touches `pitches`; under 100 ms
  - [ ] **Say out loud:** why 75, and what the league table is for
  - [ ] Committed

---

## Phase 3: It's a website (Days 4–5)

- [ ] **Task 17: Next.js + `/api/health`** (M) — depends on 16
  - [ ] Pooled connection string; `web/lib/db.ts` the only connection site
  - [ ] Verify: `/api/health` returns the pitch count before any UI is written

- [ ] **Task 18: Pitcher search** (M) — depends on 17 — *first full vertical slice*
  - [ ] Trigram search, ≥200-pitch floor, capped at 10
  - [ ] Verify: "sku" finds Skubal; "zzz" is an empty state, not a crash
  - [ ] Verify: `EXPLAIN` shows the trigram index in use

- [ ] **Task 19: Matchup API + main screen** (M) — depends on 18
  - [ ] 75-pitch rule applied **in the API**, as `{kind:'value'}` | `{kind:'insufficient'}`
  - [ ] Arsenal floor 3% of pitches — confirm it yields 3–5 shapes for real starters
  - [ ] "Tonight's edge" computed server-side
  - [ ] Verify: three real pitchers checked against hand-run SQL

- [ ] **Task 20: Detail view, empty states, phone** (M) — depends on 19
  - [ ] League comparison in words, never a percentile; count on every rate
  - [ ] "Not enough data — 41 pitches seen, below the 75 threshold."
  - [ ] Verify: complete the flow on your actual phone

- [ ] **CHECKPOINT C — Days 4–5 done**
  - [ ] Pick pitcher → 9 hitters → tap → why, on a phone
  - [ ] **Say out loud:** why the page never queries `pitches`; why location isn't in the shape
  - [ ] Committed

---

## Phase 4: Ship it (Days 6–7)

- [ ] **Task 21: Deploy to Vercel** (S) — depends on 20
  - [ ] `iad1`, pooled string in env, no secret in the repo
  - [ ] Verify: open on cellular data; verify the Neon wake-from-idle path

- [ ] **Task 22: README** (S) — depends on 21
  - [ ] Six sections in order; shape-matching framed as **the standard approach**
  - [ ] Closes with movement clustering + the bimodality evidence from Task 9
  - [ ] Verify: read cold in under 90 seconds

- [ ] **Task 23: Rehearse the two-minute explanation** (XS) — depends on 22
  - [ ] Twice, no notes
  - [ ] Answer "isn't this just BvP with extra steps?" and "what's wrong with it?"
  - [ ] **This is success criterion #3. It is not optional.**

- [ ] **Task 24: Zone heatmap** (M) — OPTIONAL, ***first to cut***
  - [ ] Only if 9–23 are genuinely done

---

## Deliberately NOT in this plan

Multi-season data (ruled out on storage), movement-based clustering (README section),
scheduled refresh jobs, head-to-head history, projections, live game data.
