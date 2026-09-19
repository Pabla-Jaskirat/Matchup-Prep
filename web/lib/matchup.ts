/**
 * The rules that decide what a coach sees, kept out of both the route and the
 * components so there is exactly one copy of each.
 *
 * The thresholds in particular: if the 50-pitch rule lived in a component, the
 * next component would forget it, and a cell built on 11 pitches would be
 * printed as though it were a fact.
 */

/** A hitter-shape cell needs this many pitches to print a number. Lowered from
 *  75 after the Task 15 audit; every rate is shown with its own count. */
export const MIN_PITCHES = 50;

/** A shape must be this share of a pitcher's season to count as part of his
 *  arsenal. A share, not a count: 3% of a reliever's 300 pitches is 9 and 3%
 *  of a starter's 3,000 is 90, and a fixed floor would treat those alike. */
export const ARSENAL_FLOOR_PCT = 3;

/** How far from league a whiff rate has to sit before it is worth a word.
 *  Five percentage points on a league rate near 25% is a fifth of the rate. */
export const LEAGUE_MARGIN = 0.05;

export type Verdict = "worse" | "typical" | "better";

export type ShapeStat = {
  pitches_seen: number;
  swings: number;
  whiffs: number;
  out_of_zone: number;
  chases: number;
  batted_balls: number;
  whiff_rate: number | null;
  chase_rate: number | null;
  avg_est_woba: number | null;
  avg_exit_velo: number | null;
};

export type LeagueStat = {
  whiff_rate: number | null;
  chase_rate: number | null;
  avg_est_woba: number | null;
};

/**
 * Either a number or the reason there isn't one. The union is the point: a
 * component cannot render a rate without having handled the other case first.
 */
export type Cell =
  | ({ kind: "value"; whiff_delta: number | null; verdict: Verdict | null } & ShapeStat)
  | { kind: "insufficient"; pitches_seen: number };

export type ArsenalEntry = { shape_id: string; pitches: number; share: number };

export function buildArsenal(
  rows: { shape_id: string; pitches: number; season_pitches: number }[],
  floorPct: number = ARSENAL_FLOOR_PCT,
): ArsenalEntry[] {
  return rows
    .map((r) => ({
      shape_id: r.shape_id,
      pitches: r.pitches,
      share: r.season_pitches ? (r.pitches / r.season_pitches) * 100 : 0,
    }))
    .filter((r) => r.share >= floorPct)
    .sort((a, b) => b.pitches - a.pitches || a.shape_id.localeCompare(b.shape_id));
}

/**
 * Worse for the *hitter*: he misses more often than the league does against
 * this pitch. Reported only when both sides have a rate — a hitter who cleared
 * the pitch floor without ever swinging has no whiff rate, and 0% would read
 * as "he never misses".
 */
export function verdictFor(
  hitter: number | null,
  league: number | null,
  margin: number = LEAGUE_MARGIN,
): Verdict | null {
  if (hitter === null || league === null) return null;
  const delta = hitter - league;
  // Binary floating point puts 0.30 - 0.25 at 0.04999999999999999, so an
  // exactly-at-the-margin difference would fall inside the margin. Rates are
  // stored as numeric(5,4); a tolerance this small cannot hide a real one.
  const epsilon = 1e-9;
  if (delta >= margin - epsilon) return "worse";
  if (delta <= -margin + epsilon) return "better";
  return "typical";
}

export function makeCell(
  stat: ShapeStat | undefined,
  league: LeagueStat | undefined,
  minPitches: number = MIN_PITCHES,
): Cell {
  if (!stat) return { kind: "insufficient", pitches_seen: 0 };
  if (stat.pitches_seen < minPitches) {
    return { kind: "insufficient", pitches_seen: stat.pitches_seen };
  }
  const leagueWhiff = league?.whiff_rate ?? null;
  return {
    kind: "value",
    ...stat,
    whiff_delta:
      stat.whiff_rate !== null && leagueWhiff !== null ? stat.whiff_rate - leagueWhiff : null,
    verdict: verdictFor(stat.whiff_rate, leagueWhiff),
  };
}

/**
 * Of tonight's pitches, the one this hitter handles worst *relative to the
 * league*. Deliberately relative rather than absolute.
 *
 * Measured on the real data, a Jays regular sits below league whiff rate on
 * most shapes — they are good major-league hitters and the cells thick enough
 * to show are the pitches they see most. An absolute "weak against" marker
 * would leave the page almost blank and would tell a coach nothing about
 * Guerrero, who beats league on every shape he has enough data for. His worst
 * pitch is only his least-good one, and "which one do we throw him" still has
 * an answer.
 *
 * Needs two usable cells: one number is not a comparison.
 */
export function attackShape(cells: Record<string, Cell>, arsenal: string[]): string | null {
  const ranked = arsenal
    .map((shape_id) => ({ shape_id, cell: cells[shape_id] }))
    .filter(
      (x): x is { shape_id: string; cell: Extract<Cell, { kind: "value" }> } =>
        x.cell?.kind === "value" && x.cell.whiff_delta !== null,
    );
  if (ranked.length < 2) return null;
  ranked.sort(
    (a, b) => b.cell.whiff_delta! - a.cell.whiff_delta! || a.shape_id.localeCompare(b.shape_id),
  );
  return ranked[0].shape_id;
}

/** The shape that is the attack pitch for the most hitters. */
export function tonightsEdge(
  hitters: { attack: string | null }[],
): { shape_id: string; hitters: number } | null {
  const counts = new Map<string, number>();
  for (const h of hitters) {
    if (h.attack) counts.set(h.attack, (counts.get(h.attack) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  // Sorted, not "first seen": a tie broken by insertion order would reshuffle
  // the banner whenever the query planner changed row order.
  const [shape_id, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { shape_id, hitters: n };
}

/**
 * Which side this hitter bats from against a pitcher of `hand`.
 *
 * A shape id carries the pitcher's hand ("R-SL-1"), so the side he used
 * against righties is simply the side where his righty-shape pitches are. For
 * most hitters there is only one. For a switch-hitter the two barely overlap,
 * and picking the wrong one reports a man who has seen almost nothing.
 */
export function standForHand(
  byStand: Record<string, Record<string, number>>,
  hand: string,
): string | null {
  let best: string | null = null;
  let bestTotal = 0;
  for (const [stand, shapes] of Object.entries(byStand)) {
    let total = 0;
    for (const [shape, n] of Object.entries(shapes)) {
      if (shape.startsWith(`${hand}-`)) total += n;
    }
    if (total > bestTotal) {
      best = stand;
      bestTotal = total;
    }
  }
  return bestTotal ? best : null;
}
