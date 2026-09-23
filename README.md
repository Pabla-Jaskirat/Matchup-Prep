# Matchup Prep

**Pick the opposing starting pitcher and see which of his pitches each Blue Jays hitter handles, and which he doesn't.**

A phone-first web app for a hitting coach preparing for a game, built on every pitch of the 2026 MLB season (696,100 of them, from Statcast).

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/home-in-season.png" alt="Home page: the Jays' next games with the opposing probable starters"></td>
    <td width="33%"><img src="docs/screenshots/grid.png" alt="Matchup page for Paul Skenes: his arsenal, then every Jays hitter's miss rate on each of his pitches"></td>
    <td width="33%"><img src="docs/screenshots/how-it-works.png" alt="How it works: one dot per pitch, with each pile clearing the 50-pitch line"></td>
  </tr>
  <tr>
    <td align="center"><sub>The next opposing starters, one tap away</sub></td>
    <td align="center"><sub>The whole lineup against his arsenal</sub></td>
    <td align="center"><sub>The idea, explained with the pitches themselves</sub></td>
  </tr>
</table>

## The idea

A hitter almost never sees enough of one pitcher to learn anything. Vladimir Guerrero Jr. saw **19 pitches** from Paul Skenes all season. The most swings any hitter took against any one pitcher was **34**.

But he sees the same *kinds* of pitches all season long. So the app ignores who threw a pitch and groups every pitch by two things: **the hand that threw it** and **the kind of pitch** (a righty's sinker, a lefty's slider). That gives 16 groups covering 98.6% of all pitches, and the numbers get big:

| Guerrero vs a righty's… | from Skenes | from every right-hander |
|---|---:|---:|
| sinker | 9 | 439 |
| sweeper | 6 | 141 |
| changeup | 2 | 73 |
| four-seam fastball | 2 | 325 |

The matchup page crosses a starter's pitches with each Jays hitter's record against those kinds of pitches, from anyone. Every number is a miss rate (how often he swings and misses), coloured against the MLB average and shown with the number of swings behind it.

## What's in the app

- **Home page:** the Jays' next games with the opposing probable starters, from MLB's public schedule. In the offseason it falls back to the last games played, so it's never empty. Or search any pitcher.
- **The matchup grid:** hitters down the side, his pitches across the top. It opens with the hitters he's most likely to trouble. Tap a pitch to sort by who misses it most. Each hitter's weakest pitch is outlined, and the starter's "best weapon against us" is called out at the top.
- **Honest gaps:** a hitter needs 50 pitches of a kind before he gets a number; below that the cell stays blank. Pitch types too rare to measure are named rather than hidden.
- **How it works:** the idea as a scrolling picture, one dot per pitch, plus a plain-language "Why 50?".

## Does it hold up?

Measured with a split-half test (`make reliability`): every pitch goes into one of two random halves, and every number is computed twice from pitches that never overlap.

- **The numbers repeat.** A hitter's miss rate on a pitch group in one half predicts the other half at r = 0.70, so a full season's number is reliable to about **0.83**. The same test on hitter-versus-pitcher **can't even run**: no pair has the 50 swings it needs.
- **It isn't just "good hitters are good".** After removing each hitter's overall miss rate and how hard each pitch is for everyone, what's left, a hitter's trouble with a *specific* pitch, still repeats at **0.48**. That's real but not overwhelming, roughly half signal and half noise, which is why every number in the app shows its sample size.
- **Hand + pitch type is the right level of detail.** It captures more real difference between hitters (5.0 points of miss rate) than coarser groupings (4.5). Adding pitch speed (4.9) splits samples thinner without finding anything new.

## Limits, stated plainly

- **50 pitches is a judgment call.** It was 75 until most of the grid came up blank. It's defensible only because every number shows its swing count.
- **One season.** The database is Neon's free tier (500 MB), and one season of pitches is 207 MB.
- **Statcast's classifier is inherited.** MLB's tracking system decides what counts as a slider or a sweeper. What's mine is the handedness split, the minimums, the comparison with the average, and stopping at this level after measuring that finer doesn't help.
- **Miss rate is the only number shown.** Chase rate and contact quality are computed and stored but not shown, to keep the grid readable. Contact quality wouldn't survive a 50-pitch sample anyway.

Every one of these, and every other judgment call, is written up with the measurement behind it in **[DECISIONS.md](DECISIONS.md)**.

## How it's built

```
Statcast (pybaseball)  →  Python pipeline  →  Postgres (Neon)  →  Next.js
 696,100 pitches           group every pitch     pre-built stats      server-rendered,
 as parquet                into hand + type,     tables: a page       phone-first
                           build the stats,      never scans the
                           cross-check them      pitch table
```

- **`ingest/`**: Python 3.12. Downloads Statcast, loads it, assigns every pitch to a group, and builds the stats tables. The aggregates are checked against a second, separately written implementation (`make verify`).
- **`db/`**: SQL migrations, and the grouping rule as a JSON file (`db/shapes/`).
- **`web/`**: Next.js 16 and React 19, TypeScript. The rules that decide what a coach sees (the 50-pitch floor, the arsenal floor, the colour thresholds) live in `web/lib/` as pure functions with unit tests, apart from the components.
- **`web/data/`**: the numbers on How it works, frozen by scripts (`make explainer`, `make reliability`), never typed into the page.

## Run it locally

You need Python 3.12, Node 20.9+, and a Postgres database (a free [Neon](https://neon.tech) project works).

```bash
# 1. Python environment
python3 -m venv ingest/.venv
ingest/.venv/bin/pip install -r requirements.txt

# 2. Database connection: fill in both strings
cp .env.example .env

# 3. Build the data: download the season, load it, group it, aggregate it
make refresh

# 4. Run the app at http://localhost:3000
cd web && npm install && cd ..
make dev
```

`.env` holds two connection strings: `DATABASE_URL` (direct, used by the pipeline and migrations) and `DATABASE_URL_POOLED` (pooled, the only one the web app reads). When deploying, also set `NEXT_PUBLIC_SITE_URL` so link previews get absolute URLs.

## Tests and checks

```bash
make test          # the web app's unit tests, then the Python ones
make web-build     # production build; fails on any TypeScript error
make verify        # re-count the Jays hitters in Python and compare to the SQL
make reliability   # the split-half test above
```

The [Makefile](Makefile) lists every other target, each with a one-line description.

---

Built as a portfolio project for a Baseball Systems application with the Toronto Blue Jays. Not affiliated with or endorsed by MLB or the Blue Jays. Data: MLB Statcast via [pybaseball](https://github.com/jldbc/pybaseball), and the MLB Stats API.
