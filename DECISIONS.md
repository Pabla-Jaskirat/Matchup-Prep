# Decisions

Every choice in this project that someone could reasonably have made differently,
why it went the way it did, and what evidence backed it. Newest last.

Three columns matter: **what was decided**, **what it cost**, and **what would
change my mind**. A decision with no cost is usually a decision nobody made.

Legend: ✅ measured · 🤔 judgment call · ❌ prediction that turned out wrong

---

## The premise

### 1. Match hitters to pitch *characteristics*, not to the pitcher ✅

**Decided:** Don't use batter-vs-pitcher history. Instead describe every pitch by
its shape, and pull a hitter's record against that shape from *everyone* who
throws it.

**Why:** Vladimir Guerrero Jr. has seen **25 pitches total from Logan Gilbert**
all season — 14 four-seamers, 6 sliders, 2 splitters, 2 sweepers, 1 changeup.
You cannot say anything about a hitter from 14 pitches. Against *RHP four-seamers
at 95+ from anyone*, he has seen **181**. Same question, usable sample.

**Cost:** It assumes one 95 mph four-seamer plays like another. Two pitchers with
the same velocity and different movement get treated as the same pitch.

**What would change my mind:** If shape-level numbers failed to predict anything,
the abstraction would be buying sample size at the price of meaning.

**Not novel.** This is what Stuff+ and PitchingBot do. The README says so
explicitly — claiming invention here would be the fastest way to lose credibility.

### 2. Shape = pitcher hand + pitch type + velocity band 🤔

**Decided:** Three ingredients, in that order.

**Why:** Handedness changes the ball's approach angle and is the first thing any
coach asks. Pitch type is Statcast's own classification. Velocity is the cheapest
signal that separates two pitches sharing a label.

**Cost:** It inherits Statcast's classifier. If Statcast calls a pitch a slider,
so do we — including when it's wrong.

**Known weakness, stated in the README:** velocity cannot separate a slider from
a sweeper. They overlap in speed and differ **3.6× in horizontal break**.
Clustering on movement would *derive* the distinction instead of inheriting it.
That is the stated next step.

### 3. One season only ✅

**Decided:** 2026 only. No multi-season history.

**Why:** Neon's free tier is 500 MB. One season of pitches is 207 MB; the full
database is now 357 MB. A second season does not fit.

**Cost:** This is the binding constraint on the whole project. Every thin-sample
problem downstream traces back here, not to the method.

---

## Sample-size discipline

### 4. A hitter cell needs 50 pitches to show a number ✅ *(revised)*

**Originally 75.** Lowered to 50 in Task 15 — see decision 14.

**Why any floor at all:** Below it, a whiff rate is noise wearing a number's
clothes. The page prints a sentence — "Not enough data — 41 pitches seen" —
rather than a percentage nobody should act on.

**Cost:** 50 pitches is roughly 25 swings. A whiff rate on 25 swings moves ~4
points if one swing changes. It is defensible **only because every displayed rate
carries its own pitch count**, so a reader can discount a thin one.

### 5. A shape needs 5,000 league pitches to exist ✅

**Why:** The shape is the yardstick every hitter is measured against. A yardstick
built from 900 pitches is not a yardstick.

**Effect:** Knuckleballs, screwballs, eephus pitches and eight other rare types
never become shapes. 9,444 pitches (1.4%) end up unassigned, and the loader
prints them by type so they are visibly excluded rather than silently missing.

### 6. Show the count next to every rate ✅

**Decided:** Rates are stored *with* their denominators, and the page shows both.

**Why:** "22% whiff rate" is unfalsifiable. "22%, on 108 pitches" lets a coach
decide for himself. It is also what makes decision 4's lower floor honest.

---

## The banding rule

### 7. The band decision lives in a JSON file, not in code ✅

**Decided:** `db/shapes/v1_type_velo.json` holds every band edge. Scripts read it.

**Why:** It is the only human judgment in the pipeline, so it should be the
easiest thing to change and the easiest thing to audit.

**It paid off immediately.** Task 15 changed the shape count from 33 to 20. That
was a rule edit and a re-run, not a migration.

### 8. Bands are half-open: `velo_min <= speed < velo_max` ✅

**Why:** A pitch exactly on the boundary must land in exactly one band. Closed
ranges would match it twice.

**Safety property worth knowing:** if two bands ever overlapped, one pitch would
match both and **Postgres would refuse the entire statement** rather than quietly
keep whichever row arrived last. A loud failure instead of wrong numbers.

**Verified:** 0 of 683,797 assigned pitches sit outside their own band, on speed,
hand or type. That is a standing `make check` assertion.

### 9. Outer bands are unbounded ✅

**Why:** A 104 mph four-seamer has to land somewhere. An open top and bottom mean
no pitch of a known type is ever orphaned by a velocity outlier.

### 10. Percentiles use all pitches; histograms clip the outer 1% ✅

**Why:** 88 of 63,766 RHP sliders (0.14%) are recorded under 70 mph — tracking
errors. They barely move a percentile but stretched the display across ~60 empty
bins starting at 34 mph.

**Guard:** clipping is display-only and never touches a reported statistic. A
test asserts clipping cannot hide a genuine second peak.

---

## Predictions that turned out wrong

### 11. ❌ "RHP sliders will show two velocity peaks"

**Predicted:** a bimodal slider distribution, ready to quote in the README.

**Measured:** **no `(hand, pitch_type)` group in the 2026 data is bimodal.** RHP
sliders are one clean peak at 87 mph. Combining sliders and sweepers (105,000
pitches) is still unimodal.

**How it was checked before being believed:** the detector fires correctly on
synthetic two-hump data, and the obvious explanation — that sliders and sweepers
were two pitches sharing a label — was tested by recombining them. Still one peak.

**Result:** the pre-written README sentence was deleted. It was false, and an
informed reviewer would have checked. What replaced it is stronger: sliders and
sweepers overlap in velocity while differing 3.6× in horizontal break, which is
a concrete argument for movement clustering.

### 12. ❌ "RHP sliders spread wider than changeups"

**Predicted:** slider IQR > changeup IQR. The task's own verification said "if it
doesn't, the query is wrong."

**Measured:** slider 3.5, changeup 4.3. **The expectation was wrong, not the code.**
The query was checked against an independent probe before concluding.

### 13. ❌ "`shape_id integer REFERENCES pitch_shapes(shape_id)`"

**Sketched in PLAN.md.** `shape_id` is text and unique only within a method, so
that foreign key **could not have been created at all**. It is composite:
`(method, shape_id)`.

---

## The Task 15 decision — the big one

### 14. 33 shapes became 20; the floor went 75 → 50 ✅ *(user's call)*

**The failure:** with 33 shapes and a 75-pitch floor, a typical Blue Jays hitter
facing a typical starter had **one usable number out of a seven-shape arsenal**.
Only 14% of the 447 hitter-shape cells cleared 75 pitches. Four of fourteen
hitters showed nothing at all.

**The cause is arithmetic, not data quality.** The pool saw 17,657 pitches all
season. Split 33 ways that is ~40 per shape, and splitting a group halves every
hitter's sample in it.

**Four options, measured rather than argued about:**

| grouping | shapes | arsenal | usable | hitters blank |
|---|---|---|---|---|
| 33 shapes, bands everywhere | 33 | 7 | 2.0 | 2 of 14 |
| **3 bands where IQR > 5.0** | **20** | **5** | **3.0** | **1 of 14** |
| 2 bands where IQR > 5.0 | 18 | 5 | 3.0 | 1 of 14 |
| no velocity bands at all | 16 | 5 | 3.0 | 1 of 14 |

**The tie is the finding.** The bottom three are identical on coverage, so
velocity bands on the widest groups are **free** — they keep real information at
no measurable cost. The bands that were cut were not separating anything:

- RHP sliders span **3.5 mph**. A "slow" one is 85 and a "fast" one is 88. Same pitch.
- RHP curveballs span **5.6 mph**. A 73 and an 87 are different pitches to face.

**Result:** 20 shapes, typical matchup fills **3 of 5 (60%)** against a 57% bar.

**Cost, stated plainly:** the floor dropped to 50, which is thinner than ideal.
Sean Keys (231 pitches all season) still shows nothing. No banding fixes 231
pitches.

### 15. The verdict is a share, not a count ✅

**Caught myself moving a goalpost.** The bar was "about 4 usable shapes," written
when arsenals were 7 — so it meant **4/7 ≈ 57%**. Cutting the shapes also shrank
arsenals to 5, where an absolute "4" would silently demand 80%: a *harder* bar,
reached by accident rather than by decision. The check measures the share.

---

## Things deliberately left out

### 16. Location is not part of the shape ✅

**Measured before deciding.** Righty-vs-righty whiff rate varies:
- **23.5 points** across pitch types (sinker 13.2% → splitter 36.7%)
- **20.5 points** across locations inside the strike zone (zone 4 at 6.7% → zone 9 at 27.2%)
- **57.7 points** including out-of-zone (zone 14 at 64.4%)

**So location matters about as much as pitch type.** It is still excluded.

**Why:** 20 shapes × 9 zones = 180 buckets per hitter. Guerrero's *best* shape has
181 pitches — about 20 per zone, against a 50-pitch floor. Every cell would read
"not enough data."

**And the biggest slice is already captured.** The largest location effect is
chase behaviour — swinging at balls — which the page reports directly as chase rate.

### 17. Batter-vs-pitcher history is not shown at all 🤔

**Why:** showing "3-for-11 lifetime off Gilbert" next to a shape-based number
invites the coach to trust the 11. The whole argument of the tool is that the 11
is worthless. Displaying it undermines the point.

### 18. Also out: multi-season data, movement clustering, scheduled refresh,
projections, live game data.

Movement clustering is the stated next step in the README, with the bimodality
evidence behind it. The rest are out of scope for seven days.

---

## Data correctness

### 19. `stand` belongs to the pitch, not to the player ✅

**Decided:** `players` has no batting-side column. `stand` is recorded per pitch
and is part of every aggregate key.

**Why:** a switch-hitter bats from the side opposite whoever is pitching. His
numbers batting left and batting right are *different numbers*, and which one
applies tonight is decided by the opposing starter's hand.

**Verified:** Brandon Valenzuela appears with both `stand = 'L'` and `stand = 'R'`.

### 20. `pfx_x` is flipped for left-handers ✅

Horizontal break is signed from the catcher's view, so it must be multiplied by
−1 for LHP before any comparison across handedness. Tested, including that it
does not mutate the caller's data or touch vertical break.

### 21. Chase rate excludes untracked pitches ✅

**Decided:** the denominator is `count(*) FILTER (WHERE in_zone IS FALSE)`, never
`count(*) - count(in_zone)`.

**Why:** `in_zone` is NULL for 0.41% of pitches — the tracking missed them, which
is **not** the same as the pitch being a ball. Treating unknown as out-of-zone
inflates the denominator and quietly deflates every chase rate on the page.

`in_zone` is deliberately NULL rather than false in the schema so this mistake is
hard to make.

### 22. The aggregation is written twice, on purpose ✅

**Decided:** SQL does the real work; an independent Python implementation
re-counts the same hitters and compares every field.

**Why:** 684,000 rows should not cross the wire to be counted — but SQL that is
subtly wrong still returns plausible numbers.

**It earned its place on the first run.** 42 of 447 rows disagreed, always by one
unit in the last decimal place, always with SQL higher. **Postgres rounds a half
away from zero; Python rounds it to the nearest even digit.** 73.05 is 73.1 in
SQL and 73.0 in Python. The database was right. After the fix: **0 mismatches.**

A difference that small reads as noise and was actually two implementations
disagreeing.

### 23. Every league row must equal the sum of its hitter rows ✅

The strongest assertion in `make check`. A group-by that dropped or duplicated a
dimension surfaces here and almost nowhere else. Currently 0 disagreements.

---

## Schema

### 24. `method` leads the primary key of every shape and stats table ✅

**Why:** today's definition is `v1_type_velo`. A later movement-based definition
arrives as `v2_movement` **rows beside it** — both can be queried and compared.
Without `method` in the key, v2 would mean rewriting the table.

### 25. `shape_assignments` is materialised, not computed at query time ✅

**Why:** the aggregation asks "which shape is this pitch?" 684,000 times. Writing
the answer down once turns a range check into an equality join.

**Cost:** 136 MB — more than the ~80 MB estimated. That is why the database is
357 MB rather than under 350.

### 26. The web app never queries `pitches` ✅

Page loads read the three stats tables only: a key lookup over a few thousand
rows instead of a scan of 696,100. This is what makes it usable on a phone in a
clubhouse.

### 27. The roster is fetched, not hardcoded ✅

**Why:** a list of fourteen names in the source is wrong within a week, and is
exactly the kind of thing a reviewer notices.

**It also fixed a real bug.** `players.team` was NULL on all 2,525 rows since Day
1 — StatsAPI's `/people` endpoint returns `currentTeam: null` unless the request
hydrates it. Nothing errored; no check asserted on team; it sat there unnoticed.
Fixed at the source, and `make check` now asserts the pool size so it cannot
happen again silently.

### 28. Zone stats cover only the Blue Jays hitter pool ✅

League-wide it would be ~300,000 rows for a view that is optional and first to
cut. These are the only rows that can ever reach a screen.

### 29. The app uses the pooled connection string, and the direct one is not a fallback ✅

Every request to a serverless function is its own process. Without Neon's
pooler, a page that fans out to a handful of queries opens more connections than
the database will accept, and the failure appears under load rather than in
development.

`requireUrl()` reads `DATABASE_URL_POOLED` and nothing else. If it is missing the
app fails loudly at the first query rather than quietly falling back to
`DATABASE_URL` and working fine on one machine. A test pins that: passing only
`DATABASE_URL` throws.

**What it cost:** two variables to keep straight instead of one.

### 30. One file opens connections; one file on disk holds the credential ✅

`web/lib/db.ts` is the only place a `Pool` is constructed. Everything else calls
`query()`.

Locally it loads the repo-root `.env` — the same file ingestion already uses —
rather than a second `web/.env.local`. Two files holding the same password is two
chances to commit one. On Vercel the variable is set in the project and the
dotenv call never runs.

**What would change it:** if the web app ever needed a different database than
ingestion, these would have to separate again.

### 31. `/api/health` exists before any UI ✅

It returns the pitch count, the hostname, and whether the host is pooled. A
connection problem found through a blank health route takes two minutes to
diagnose; the same problem found through a broken page takes an hour.

It is `force-dynamic` — a health check answered at build time is not a health
check — and on failure it returns the error's *name* only. Driver errors can
carry the connection string in their message, so the message never crosses the
boundary; it goes to the server log.

**First run measured:** 3.0 s cold (Neon waking from idle), 120 ms warm. The cold
path is what Task 21 has to verify on the deployed app.

### 32. Search is substring matching, not fuzzy matching ✅

Typing `sku` finds Skubal because those three letters are in his name. Typing
`scoobal` finds nothing.

Trigram *similarity* could have matched the typo, and the temptation was real —
it demos well. But a coach who mistypes and gets confidently handed the wrong
pitcher has been actively misled, and there is no way to tell from the screen.
Similarity is still used, but only to order names that already matched.

**What it cost:** no typo tolerance.
**What would change it:** a coach telling me they type fast and mistype often.

### 33. Accents are stripped on both sides, in a generated column ✅

Statcast spells names with their accents — `Jesús Luzardo`, `Cristopher Sánchez`
— and nobody types them. Migration 007 stores `search_name`, an unaccented
lowercase copy, and puts the trigram index there.

`unaccent()` is STABLE rather than IMMUTABLE because it resolves its dictionary
through `search_path`, and a generated column requires IMMUTABLE. The wrapper
names the dictionary explicitly, which makes the immutability claim honest
rather than a lie to the planner.

**Verified:** `sanchez` finds `Cristopher Sánchez`; `nunez` and `Núñez` return
the same six names.

### 34. A pitcher needs 200 pitches to appear in search ✅

Otherwise typing two letters returns position players who threw one mop-up
inning. There is no arsenal to show for a man who threw eleven pitches all year.

**Measured:** 635 pitchers clear it in 2026, and `make check` now asserts that
count stays in range. Aaron Judge, who has pitched, does not appear.

### 35. The typed query is escaped before it reaches LIKE ✅

`%` and `_` are LIKE wildcards. Without escaping, a single `%` returns the whole
table, and `%` typed into a search box is not hypothetical. `escapeLike()` is
pure and tested, including the case that matters: the backslash is escaped
first, or the escaping escapes its own output.

**Verified:** `%%` and `__` both return nothing.

### 36. The pitch count is a correlated subquery, not a join ✅

Counting every pitcher's pitches means grouping 696,100 rows. Counting only the
names that already matched three typed letters means one index lookup each.

**Measured:** 0.76 ms execution, `Bitmap Index Scan on players_search_trgm_idx`
in the plan. Worst realistic case — a two-letter query matching ~600 names —
is 57 ms warm.

---

## Open — still to defend

- **The 50-pitch floor.** Thinner than ideal. Justified only by showing counts.
- **The 3% arsenal floor.** Chosen, not measured. Needs confirming that it yields
  3–5 shapes for real starters (Task 19).
- **Inheriting Statcast's pitch classifier.** The slider/sweeper overlap is the
  concrete example of where it fails.
- **Sean Keys and two other hitters** will show almost nothing. The page must say
  so clearly rather than look broken.
