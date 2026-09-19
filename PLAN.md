# Matchup Prep — Build Plan

Portfolio project for **Baseball Systems — App Development, Toronto Blue Jays**.
Deadline: 7 days from 2026-09-17.

---

## What it is

An internal-style web tool for a Blue Jays hitting coach preparing for a game.
Pick an opposing starting pitcher → see, for each Jays hitter, which pitch shapes
in that pitcher's arsenal he handles poorly and which he handles well.

Audience: a coach on a phone in a clubhouse. Readability over sophistication.
Real audience: a Blue Jays hiring manager spending 90 seconds.

## Confirmed intent

- **Outcome:** Working web tool, pitcher → 9 hitters → per-shape strengths/weaknesses,
  with pitch counts behind every number and "not enough data" below threshold.
- **User:** Hitting coach, phone, two taps.
- **Success:** (1) runs end to end on real Statcast data, (2) sample-size restraint
  visible on screen, (3) **you can explain the shape-matching idea out loud in 2 minutes.**
  (3) is a hard requirement.
- **Constraint:** 7 days, learning both the baseball concepts and parts of the stack.
- **Out of scope:** head-to-head history, season stat lines, projections, live game data,
  automatic probable-starter lookup, movement-based clustering, multi-season data,
  scheduled precompute jobs.

## The central design decision

Batter-vs-pitcher history is too small to mean anything — a hitter may have seen
11 career pitches from a given pitcher. So match hitter to **pitch characteristics**,
not to pitcher:

1. Characterize the pitcher's arsenal as a set of "shapes" (hand + pitch type + velo band).
2. For each hitter, compute performance against every pitch of that shape thrown by *anyone*.
3. The report is the intersection.

Turns a sample of 11 into thousands.

**This is the standard industry approach, not a novel one.** Frame it that way —
"stuff models" like Stuff+ and PitchingBot are built on the same premise. Claiming
novelty gets marked down by an informed reviewer. The judgment is what's yours:
choosing the coach as the user, refusing to print numbers below 75 pitches,
cutting head-to-head history on purpose.

---

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| What's on screen | **Absolute rate, colored by league delta** | Coach sees what happens tonight AND whether it's a real weakness. Needs `league_shape_stats`. |
| Location in shape? | **No** — detail-view dimension only | Adding a 3x3 grid multiplies ~50 buckets by 9, drops samples under threshold. Recreates the BvP problem. |
| Switch-hitters | **`stand` in the aggregate key** | Statcast `stand` changes row to row for switch-hitters. Not a player property. |
| Seasons | **2026 to-date only** | Measured 2026-09-17: `pitches` is 207 MB of a 500 MB free tier, ~300 MB once shape_assignments lands. A second season would exceed it. If Day 3 samples are thin, widen the velocity bands instead of adding data — fewer, bigger buckets, and simpler to explain. |
| Shape method | `pitch_type` + velo band + `p_throws` | Defensible, fast. Movement clustering = documented next step. |
| Refresh | Manual `make refresh` | A cron job you can't demo is decoration. |
| Sample threshold | 75 pitches (higher for contact quality) | Enforced by storing counts next to rates. |

Cut from the original brief: 3 seasons → 1, scheduled job → manual command,
movement clustering → README section, spin/release-point/extension stored but unused.

---

## Schema

One big table of every pitch; a player list; shape definitions; a lookup mapping
pitch → shape; three summary tables holding the answers so the website never
touches the big table.

```sql
CREATE TABLE players (
  mlbam_id   integer PRIMARY KEY,
  full_name  text NOT NULL,
  throws     char(1),          -- pitchers only
  team       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- NOTE: no batting hand here, on purpose (switch-hitters).
```

```sql
CREATE TABLE pitches (
  game_pk       integer  NOT NULL,
  at_bat_number smallint NOT NULL,
  pitch_number  smallint NOT NULL,
  game_date     date     NOT NULL,
  season        smallint NOT NULL,

  pitcher_id    integer  NOT NULL,
  batter_id     integer  NOT NULL,
  p_throws      char(1)  NOT NULL,
  stand         char(1)  NOT NULL,   -- batter's side THIS pitch

  pitch_type    text,                -- nullable: Statcast has gaps
  release_speed numeric(4,1),
  pfx_x         numeric(5,3),        -- horizontal break, feet
  pfx_z         numeric(5,3),        -- vertical break, feet
  spin_rate     integer,
  extension     numeric(4,2),

  plate_x       numeric(5,3),
  plate_z       numeric(5,3),
  zone          smallint,            -- Savant 1-9 in zone, 11-14 out

  balls         smallint,
  strikes       smallint,
  description   text NOT NULL,
  events        text,

  launch_speed  numeric(4,1),
  est_woba      numeric(5,4),

  is_swing boolean GENERATED ALWAYS AS (
    description IN ('swinging_strike','swinging_strike_blocked','foul',
                    'foul_tip','hit_into_play')) STORED,
  is_whiff boolean GENERATED ALWAYS AS (
    description IN ('swinging_strike','swinging_strike_blocked','foul_tip')) STORED,
  in_zone  boolean GENERATED ALWAYS AS (zone BETWEEN 1 AND 9) STORED,
  is_bip   boolean GENERATED ALWAYS AS (description = 'hit_into_play') STORED,

  PRIMARY KEY (game_pk, at_bat_number, pitch_number)
);
CREATE INDEX pitches_pitcher_idx ON pitches (pitcher_id, season);
CREATE INDEX pitches_batter_idx  ON pitches (batter_id, season, stand);
```

The GENERATED columns are the highest-value thing here: "what counts as a swing"
is defined once, and everything downstream inherits it.

```sql
CREATE TABLE pitch_shapes (
  shape_id   serial PRIMARY KEY,
  method     text    NOT NULL,       -- 'v1_type_velo'
  p_throws   char(1) NOT NULL,
  pitch_type text    NOT NULL,
  velo_min   numeric(4,1) NOT NULL,
  velo_max   numeric(4,1) NOT NULL,
  label      text    NOT NULL,       -- 'RHP Hard Slider (87-91)'
  UNIQUE (method, p_throws, pitch_type, velo_min)
);

CREATE TABLE shape_assignments (
  game_pk       integer  NOT NULL,
  at_bat_number smallint NOT NULL,
  pitch_number  smallint NOT NULL,
  method        text     NOT NULL,
  shape_id      integer  NOT NULL REFERENCES pitch_shapes(shape_id),
  PRIMARY KEY (method, game_pk, at_bat_number, pitch_number),
  FOREIGN KEY (game_pk, at_bat_number, pitch_number)
    REFERENCES pitches (game_pk, at_bat_number, pitch_number) ON DELETE CASCADE
);
CREATE INDEX shape_assign_shape_idx ON shape_assignments (method, shape_id);
```

`method` in the PK is the migration-free swap: adding `v2_movement` later is an
INSERT, and both methods coexist for comparison.

```sql
CREATE TABLE hitter_shape_stats (
  method text NOT NULL, season smallint NOT NULL,
  batter_id integer NOT NULL, stand char(1) NOT NULL,
  shape_id integer NOT NULL REFERENCES pitch_shapes(shape_id),
  pitches_seen integer NOT NULL, swings integer NOT NULL, whiffs integer NOT NULL,
  out_of_zone integer NOT NULL, chases integer NOT NULL, batted_balls integer NOT NULL,
  whiff_rate numeric(5,4), chase_rate numeric(5,4),
  avg_est_woba numeric(5,4), avg_exit_velo numeric(4,1),
  PRIMARY KEY (method, season, batter_id, stand, shape_id)
);

CREATE TABLE league_shape_stats (
  method text NOT NULL, season smallint NOT NULL,
  stand char(1) NOT NULL, shape_id integer NOT NULL REFERENCES pitch_shapes(shape_id),
  pitches_seen integer NOT NULL, swings integer NOT NULL, whiffs integer NOT NULL,
  out_of_zone integer NOT NULL, chases integer NOT NULL, batted_balls integer NOT NULL,
  whiff_rate numeric(5,4), chase_rate numeric(5,4), avg_est_woba numeric(5,4),
  PRIMARY KEY (method, season, stand, shape_id)
);

CREATE TABLE hitter_shape_zone_stats (   -- heatmap; Day 6, first to cut
  method text NOT NULL, season smallint NOT NULL,
  batter_id integer NOT NULL, stand char(1) NOT NULL,
  shape_id integer NOT NULL REFERENCES pitch_shapes(shape_id),
  zone smallint NOT NULL,
  pitches_seen integer NOT NULL, swings integer NOT NULL, whiffs integer NOT NULL,
  PRIMARY KEY (method, season, batter_id, stand, shape_id, zone)
);
```

No extra indexes needed on stats tables — the PKs cover every app lookup.

**Built 2026-09-18 as `005_stats.sql`, with two corrections to the sketch above.**
`shape_id` is text (`'R-CU-2'`), not integer, and it is unique only within a
`method` — so the foreign key is composite, `(method, shape_id)`. The
single-column `REFERENCES pitch_shapes(shape_id)` written above could not have
been created. `batter_id` also references `players`.

---

## Shapes: deriving boundaries from data

**Step A — look before bucketing.** `analyze_shapes.py` prints, for every
`(p_throws, pitch_type)` with >= 5,000 league pitches:

```
RHP  SL   n=214,883   velo: p10 81.2  p25 83.6  p50 85.9  p75 88.4  p90 90.7
                      IQR 4.8   break: pfx_x -0.42  pfx_z 0.11   BIMODAL? yes
```

**Step B — split only what's spread out.**

- IQR < 2.5 mph → **one band**
- IQR 2.5–5.0 mph → **two bands**, split at median
- IQR > 5.0 mph → **three bands**, split at p33 / p67
- Collapse any band under 5,000 league pitches into its neighbour

Boundaries are percentiles of real pitches, so they're derived, not invented.

**Step C — bimodality check (the interview answer). MEASURED 2026-09-17 — the
expected result did not happen, and the real one is better.**

The prediction was that RHP sliders would show two velocity peaks. They do not.
**No `(hand, pitch_type)` group in the 2026 data is bimodal in velocity.** RHP SL is
a clean single peak at 87 mph. Combining SL and ST (105,000 pitches) is still unimodal.

Do not write the planned README sentence about bimodal sliders. It is not true of this
data, and an informed reviewer would check.

The evidence for movement clustering turns out to be stronger than bimodality would
have been. RHP sliders and RHP sweepers overlap heavily in velocity but differ by
**3.6x in mean horizontal break** (+0.31 ft vs +1.13 ft). Two pitches that a hitter
experiences completely differently are, to a velocity band, nearly the same pitch.
The only thing separating them in v1 is Statcast's own `pitch_type` label — a
classifier output we are trusting rather than deriving. README line:

> "Velocity bands cannot separate a slider from a sweeper: the two overlap in
> velocity while differing 3.6x in horizontal break. v1 relies on Statcast's
> pitch_type label to keep them apart, which means the shape definition is only
> as good as that classifier. Clustering on movement would derive the distinction
> instead of inheriting it. That is the next step."

**Also measured: the banding rule produces the opposite of what was expected.**
RHP SL has an IQR of 3.5; RHP CH has 4.3. **Sliders get fewer bands than changeups,
not more.** The widest groups are RHP KC (6.2), RHP CU (5.6) and RHP FS (5.1) — the
pitches thrown with the most varied intent. The Day 2 "say it out loud" checkpoint
changes accordingly: explain why *curveballs and splitters* got three bands.

Applying the rule on spread alone gives 13 groups x 2 bands + 3 groups x 3 bands =
35. The 5,000-pitch floor then overrules the spread for RHP KC: 9,476 pitches cannot
support three bands of ~3,200, or even two of ~4,700, so it collapses back to a
single shape. **Final: 33 shapes.** No hand adjustment was needed — the collapse
rule made the call.

**Gotcha:** `pfx_x` is signed from the catcher's view. Multiply by -1 for LHP
before comparing anything across handedness.

### The Task 15 decision — 33 shapes became 20

**Measured 2026-09-18.** With 33 shapes and a 75-pitch display floor, a typical
Blue Jays hitter facing a typical starter had **one usable number out of a
seven-shape arsenal**. Only 14% of the 447 hitter-shape cells cleared 75 pitches,
and four of the fourteen hitters showed nothing at all. The page did not answer
its own question.

The cause is arithmetic, not data quality: the fourteen hitters saw 17,657
pitches all season. Split 33 ways that is ~40 per shape, and splitting a group
in two halves every hitter's sample in it.

Four options were measured, not argued about (median usable shapes per matchup,
Jays pool, arsenal floor 3%):

| grouping | shapes | arsenal | usable | hitters with nothing |
|---|---|---|---|---|
| 33 shapes, bands everywhere | 33 | 7 | 2.0 | 2 of 14 |
| **3 bands where IQR > 5.0, else whole** | **20** | **5** | **3.0** | **1 of 14** |
| 2 bands where IQR > 5.0 | 18 | 5 | 3.0 | 1 of 14 |
| no velocity bands at all | 16 | 5 | 3.0 | 1 of 14 |

The last three tie. **That is the finding.** Velocity bands on the widest groups
are free: they cost nothing in coverage and keep real information. The bands
that were cut were not separating anything — RHP sliders span 3.5 mph, so a
"slow" one is 85 and a "fast" one is 88, which is the same pitch. RHP curveballs
span 5.6, and a 73 and an 87 are genuinely different pitches to stand in against.

**Decision: 3 bands where IQR > 5.0, one band otherwise, and a 50-pitch display
floor.** Result: 20 shapes, and a typical matchup fills in 3 of 5 — 60% of what
tonight's pitcher throws, against a bar of 57%.

Two honest notes:

- The 50-pitch floor is weaker than the 75 originally chosen. It is defensible
  only because every displayed rate carries its own pitch count, so a reader can
  discount a thin one rather than being shielded from it.
- PLAN.md's bar was written as "about 4 usable shapes" when arsenals were 7 —
  i.e. 4/7. Cutting the shapes also shrank arsenals to 5, so an absolute 4 would
  now demand 80%: a harder bar reached by accident. `check_coverage.py` checks
  the share, which is what was meant and is stable when the shape count changes.
- Sean Keys (231 pitches all season) still shows nothing against a typical
  starter. No banding fixes 231 pitches. The page says so.

Measured 2026-09-18: the first version of the rule yielded **33 shapes** across 16 groups
(`db/shapes/v1_type_velo.json`). Task 15 found the hitter cells too thin and cut
it to **20**; the file now holds 20 and the thinnest band is RHP Splitter under
85 at 6,407 pitches.

---

## Ingestion pipeline

Six ordered, re-runnable steps. `make refresh` chains them.

| # | Step | Does | Safe to re-run because |
|---|---|---|---|
| 1 | `fetch` | pybaseball statcast in **weekly chunks** → `data/raw/<season>/<date>.parquet` | Skips chunks already on disk |
| 2 | `load_pitches` | parquet → staging → `ON CONFLICT (game_pk, at_bat_number, pitch_number) DO UPDATE` | Natural key from the game itself |
| 3 | `build_players` | distinct ids + name lookup → upsert | Upsert on `mlbam_id` |
| 4 | `derive_shapes` | runs the analysis, writes `pitch_shapes` for the method | delete-by-method then insert |
| 5 | `assign_shapes` | INSERT…SELECT joining pitches to shapes on hand+type+velo | `ON CONFLICT DO UPDATE` |
| 6 | `aggregate` | full recompute of the three stats tables | delete by `(method, season)` then insert |

**Idempotency principle:** every table's key comes from the data itself, never from
an auto-increment or insertion order. Steps 4–6 recompute a `(method, season)` slice
completely rather than updating it incrementally. At 700k rows that takes seconds,
and "recompute everything" is far easier to prove correct.

Warnings: big Statcast pulls are slow and fail partway — that's why step 1 writes
to disk and step 2 is separate. Never re-download to re-load. Fallback if pybaseball
misbehaves: Baseball Savant's CSV export endpoint.

---

## Screens

### Main — the answer at the top

```
  vs.  TARIK SKUBAL      LHP
       4 shapes · 2026
  ------------------------------
  TONIGHT'S EDGE
  Changeup — 6 of 9 hitters weak
  ------------------------------
  1  SPRINGER              R
     ^CH   ^SL   -FF   vSI

  2  GUERRERO JR.          R
     ^CH   -SL   vFF   ·SI

  3  BICHETTE              R
     -CH   ^SL   ^FF   -SI

     ^ weak   - average
     v strong  · no data
```

### Detail — one tap

```
  <  GUERRERO JR.    R  vs LHP
  ------------------------------
  CHANGEUP      86-89 mph      ^

   Whiff     34%   worse than most
   Chase     38%   much worse
   Contact  .284   typical
                      318 pitches

   Where he misses it:
        .  .  .
        .  o  #      # misses a lot
        -  #  #      . handles it

   -> Chases it low and away.
  ------------------------------
  FOUR-SEAM     94-97 mph      v
   Whiff     18%   better than most
                      502 pitches
  ------------------------------
  SINKER        92-95 mph      ·
   Not enough data — 41 pitches
   seen, below the 75 threshold.
```

Two deliberate choices: the **number is the real rate, the words carry the league
comparison** (coach never interprets a percentile); and the empty state **says why**
it's empty, which shows the restraint is a design choice, not a bug.

---

## Build order

Each day ends with something that runs, and a sentence you can say out loud.
If you can't say it, don't start the next day.

**Day 1 — Data on your machine.** git init, Postgres running, migrations 001–002,
`fetch` + `load_pitches`. Ends with `SELECT count(*) FROM pitches` and a script
printing 10 random pitches as English sentences.
→ *Say it:* what one row of this table represents.

**Day 2 — Shapes exist.** `analyze_shapes.py` output reviewed, bands chosen by the
Step B rule, `derive_shapes` + `assign_shapes` running. Ends with a query listing
all ~50 shapes and their counts.
→ *Say it:* why curveballs and splitters got more bands than sliders.

**Day 3 — The answer exists in SQL.** `aggregate` building all three stats tables.
Ends with one query returning a hitter's worst five shapes with counts, plus a check
of how many cells fall under 75. **If too many are thin, widen the bands** (storage
rules out a second season).
→ *Say it:* why 75, and what the league table is for.

**Day 4 — It's a website.** Next.js, two API routes (`/api/pitchers/search`,
`/api/matchup`), main screen on real data. Ends with: pick a pitcher, see nine hitters.
→ *Say it:* why the page never queries the `pitches` table.

**Day 5 — Detail view and polish.** Tap-through, empty states, phone width.
Ends with the whole flow usable on your actual phone.
→ *Say it:* why location isn't part of the shape.

**Day 6 — Ship it.** Deploy to Vercel + hosted Postgres (stats tables and a trimmed
`pitches` only). Write the README. Heatmap only if everything above is done.
Aim to be submittable tonight, not tomorrow.

**Day 7 — Buffer and rehearsal.** Fix deploy breakage. Practise the two-minute
explanation until it's yours. If Day 6 was clean, the heatmap lands here.

## README sections, in order

1. What it does (3 lines)
2. The problem with batter-vs-pitcher data
3. The shape approach — *framed as the standard one*
4. Why numbers disappear below 75 pitches
5. What's deliberately out of scope
6. Known next step: movement clustering, with the bimodality evidence
