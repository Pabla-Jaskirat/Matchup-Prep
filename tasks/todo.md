# Matchup Prep — TODO (Days 2–7)

Plan: `tasks/plan.md` · 7-day context: `PLAN.md` · Day 1 archive: `tasks/day1-todo.md`
**Decision log: `DECISIONS.md`** — every judgment call, what it cost, and what
would change it. Update it whenever a task makes or overturns a decision.

**Done:** Day 1 — 696,100 pitches, 2,525 players, migrations 001–002.
Day 2 — shapes and assignments, migrations 003–004.
Day 3 — stats tables, roster, aggregation, and the Task 15 cut from 33 shapes to 20.
Day 4 — Next.js scaffold and a health route that reaches Neon.

**Loose ends:** `requirements.txt` added 2026-09-18. No README until Task 22.
**Day 4 started 2026-09-19:** the web app lives in `web/`; `make dev` runs it.

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

- [x] **Task 12: `derive_shapes` + `assign_shapes`** (M) — DONE — `make shapes`
  - [x] Half-open bands in SQL; an overlap would make Postgres reject the statement
        outright rather than silently keep the last matching row
  - [x] Shape file validated before load — gap, overlap, bounded outer band, duplicate id
  - [x] Verify: **683,797/693,241 typed pitches assigned (98.6%)**. All 9,444 misses are
        pitch types under the 5,000 floor (L FS 2,242 is the largest). No unexpected misses.
  - [x] Verify: re-run wrote the same 683,797 rows; counts unchanged
  - [x] Verify: all 33 per-shape DB counts equal the JSON exactly — the SQL predicate
        and the Python banding independently agree
  - [x] Verify: 0 of 683,797 assigned pitches sit outside their own band (now in `make check`)
  - [x] Follow-up: `004_shape_band_unique.sql` adds the `UNIQUE … NULLS NOT DISTINCT`
        constraint that Task 11 was supposed to include and I left out

- [x] **CHECKPOINT A — Day 2 done**
  - [x] Query lists every shape with its count
  - [ ] Database under 350 MB — **missed by 2 MB: 352 MB.** `shape_assignments` is
        136 MB (79 heap + 57 index). 148 MB of headroom left on Neon's 500 MB and
        Task 13's tables are aggregates, so no action taken. Lever if it ever bites:
        the repeated `method` text per row.
  - [x] Committed

---

## Phase 2: The answer exists in SQL (Day 3)

- [x] **Task 13: Migration `005_stats.sql`** (S) — DONE
  - [x] Three stats tables; counts stored beside every rate, so the 50-pitch rule
        is applied when the page renders and a coach can ask "out of how many?"
  - [x] `method, season` leads every PK — that is the slice `aggregate.py` rewrites
  - [x] `stand` in the hitter and league keys — a switch-hitter is two rows
  - [x] FK to `pitch_shapes` is composite `(method, shape_id)`; PLAN.md's sketched
        single-column `shape_id integer` FK was not creatable

- [x] **Task 16: Blue Jays roster** (S) — DONE — `make roster`
  - [x] `players.team` was **100% NULL** — `/people` returns `currentTeam: null` without
        hydration. Fixed at the source: the roster endpoint, where team is the question.
  - [x] Migration **`006_roster.sql`** adds `position` + index on `(team, position)`
  - [x] Verify: **exactly 14** non-pitchers with `team='TOR'`, every one with pitches
        on file (235 to 2,518). Two pitchers have none; expected, they are recent adds.
  - [x] Verify: re-run reports the same 28/14 and changes nothing
  - [x] `check.py` now asserts pool size 9–20 and that no Jays hitter is unseen

- [x] **Task 14: `aggregate.py`** (M) — DONE — `make aggregate`, `make verify`
  - [x] Chase denominator is `FILTER (WHERE in_zone IS FALSE)` — NULL is not out-of-zone
  - [x] `stand` in the group-by — Brandon Valenzuela appears with both sides
  - [x] 23,742 hitter rows, 66 league rows, 3,834 zone rows (Jays pool only); 8 seconds
  - [x] Verify: 0 league rows disagree with the sum of their hitters — now in `check.py`
  - [x] Verify: re-run is byte-identical (same md5 over the whole table)
  - [x] Verify: `verify_aggregate.py` re-counts all 14 Jays hitters in Python and
        compares every field — **447 rows, 0 mismatches.** It found 42 real
        disagreements first: Postgres rounds halves away from zero, Python rounds
        to even. The database was right; the reference is now `Decimal`/`ROUND_HALF_UP`.

- [x] **Task 15: Thin-cell audit** (S) — DONE — `make coverage`
  - [x] First run **failed**: 1 usable shape of a 7-shape arsenal, 4 of 14 hitters blank
  - [x] Four groupings measured; the three narrower ones tie, so velocity bands on
        the widest groups are free — same coverage, more information kept
  - [x] **Decision (yours): 3 bands where IQR > 5.0, one band otherwise, floor 50.**
        33 shapes → **20**. Typical matchup now fills 3 of 5 (60%) against a 57% bar.
  - [x] Re-ran 12 and 14: 683,797 still assigned (98.6%), 15,467 hitter rows,
        `verify_aggregate` still 0 mismatches, `make check` still all green
  - [x] Decision written into `PLAN.md` with the table it came from
  - [x] Gap found and fixed: `derive_shapes` only upserted, so 13 dropped shapes
        would have lingered with their assignments attached and double-counted
        every league total. It now removes what the file no longer defines.

- [ ] **CHECKPOINT B — Day 3 done** ← *the one that matters*
  - [ ] One query: pitcher id → 9 hitters × shapes, with counts and league deltas
  - [ ] It never touches `pitches`; under 100 ms
  - [ ] **Say out loud:** why 50 (it was 75 until Task 15), and what the league table is for
  - [ ] Committed

---

## Phase 3: It's a website (Days 4–5)

- [x] **Task 17: Next.js + `/api/health`** (M) — DONE — `make dev`, `make web-build`
  - [x] Next 16 App Router + TypeScript in `web/`; `pg` pool, `max: 1` per instance
  - [x] `web/lib/db.ts` is the only connection site; `DATABASE_URL_POOLED` only,
        and the direct string is **not** a fallback — a test pins that
  - [x] The credential stays in the one root `.env`; no second `web/.env.local`
  - [x] Verify: `{"ok":true,"pitches":696100,...,"pooled":true}` — **3.0 s cold
        (Neon waking), 120 ms warm.** The cold path is Task 21's to re-check.
  - [x] Verify: `npm run build` clean, `/api/health` listed as dynamic, not static
  - [x] Verify: `git status` shows no `.env.local` and no `node_modules`
  - [x] 10 web tests added; `make test` now runs both suites

- [x] **Task 18: Pitcher search** (M) — DONE — *first full vertical slice*
  - [x] Migration **`007_player_search.sql`**: `search_name` generated column
        (unaccented, lowercased) + trigram index. 001's index was on `full_name`,
        which cannot match `sanchez` to `Cristopher Sánchez`.
  - [x] Substring match, not fuzzy — `scoobal` finds nothing on purpose.
        Similarity only orders names that already matched.
  - [x] ≥200 pitches in 2026, capped at 10; **635 pitchers qualify**
  - [x] Verify: "sku" → Tarik Skubal · "sanchez" → Cristopher Sánchez ·
        "zzz" → empty 200 · "" → empty without touching the database ·
        `%%` and `__` → empty, not the whole table
  - [x] Verify: `EXPLAIN (ANALYZE)` shows `Bitmap Index Scan on
        players_search_trgm_idx`; **0.76 ms**, 57 ms for a two-letter query
  - [x] Keyboard alone: ↓/↑ move, Enter takes the highlighted or top result,
        Esc closes; `role="combobox"` + `aria-activedescendant`
  - [x] Built narrow-first: 44 px targets, 16 px input (below that iOS zooms)
  - [ ] Verify: **open it at 390 px yourself** — `make dev`, then your phone
        on the same wi-fi at the Network address Next prints

- [x] **Task 19: Matchup API + main screen** (M) — DONE — `/matchup/<id>`
  - [x] Migration **`008_pitcher_shapes.sql`** + a fourth aggregate:
        `shape_assignments` has no pitcher_id, so the arsenal could not be
        answered without scanning `pitches`. 5,379 rows.
  - [x] 50-pitch rule in `lib/matchup.ts`, as a discriminated union the
        component cannot render past without handling
  - [x] Arsenal floor 3% — **measured: Sánchez 3, Gausman 4, Skubal 5,
        Wheeler 7.** PLAN.md predicted 3–5; the top end was wrong. Kept.
  - [x] "Tonight's edge" server-side — Gausman: his slider, for 5 of 14
  - [x] **Changed the definition of "worst":** relative to the hitter's own
        arsenal, not absolute vs league. The median displayable Jays cell is
        3.9 points *better* than league, so the absolute version left the page
        blank and said nothing about Guerrero. League is still the chip colour.
  - [x] Verify: `verify_matchup.py` re-derives everything from raw `pitches` —
        **171 assertions across three pitchers, 0 problems** (`make verify-matchup`)
  - [x] Verify: no route touches `pitches`; 4 aggregate queries, **80 ms API /
        160 ms page warm** against a 300 ms budget (pool `max` 1 → 5)
  - [x] Verify: unknown id → 404 with a usable message; `abc` → 400
  - [ ] Verify: **nine hitters without sideways scroll at 390px — yours to check**

- [ ] **Task 20: Detail view, empty states, phone** (M) — depends on 19
  - [ ] League comparison in words, never a percentile; count on every rate
  - [ ] "Not enough data — 41 pitches seen, below the 50 threshold."
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
