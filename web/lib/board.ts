/**
 * The order of the lineup grid, by default and when a coach taps a pitch.
 *
 * Most misses first: the question behind the tap is "who do I worry about
 * against his slider?". A hitter without a number sorts to the bottom rather
 * than being read as 0%, because "not enough pitches" is not "never misses".
 */

import type { Cell } from "./matchup.ts";

type Row = { cells: Record<string, Cell> };

function missRate(cell: Cell | undefined): number | null {
  return cell?.kind === "value" ? cell.whiff_rate : null;
}

export function sortByShape<T extends Row>(hitters: T[], shapeId: string | null): T[] {
  if (!shapeId) return hitters;
  return hitters
    .map((h, i) => ({ h, i, rate: missRate(h.cells[shapeId]) }))
    .sort((a, b) => {
      if (a.rate === null && b.rate === null) return a.i - b.i;
      if (a.rate === null) return 1;
      if (b.rate === null) return -1;
      return b.rate - a.rate || a.i - b.i;
    })
    .map(({ h }) => h);
}

/**
 * How much more often than the average hitter he misses against this
 * starter's pitches, each pitch counted by how often the starter throws it.
 * Positive means more trouble than average.
 *
 * A pitch without a number counts as average, not as missing. Otherwise one
 * thin cell decides the whole score: a hitter with a single 41%-on-37-swings
 * number would outrank one who is orange on three pitches. This way a lone
 * number moves him only as far as that pitch's share of the arsenal.
 *
 * Null when not one of the pitches has a number, so a blank row is never
 * ranked as "no trouble".
 */
export function riskScore(
  cells: Record<string, Cell>,
  arsenal: { shape_id: string; share: number }[],
): number | null {
  let weighted = 0;
  let known = 0;
  const total = arsenal.reduce((sum, a) => sum + a.share, 0);
  for (const { shape_id, share } of arsenal) {
    const cell = cells[shape_id];
    if (cell?.kind !== "value" || cell.whiff_delta === null) continue;
    weighted += share * cell.whiff_delta;
    known += 1;
  }
  return known > 0 && total > 0 ? weighted / total : null;
}

/**
 * The grid's starting order: the hitters he is most likely to give trouble
 * first. Blank rows go last, in the order they came.
 */
export function byRisk<T extends Row>(
  hitters: T[],
  arsenal: { shape_id: string; share: number }[],
): T[] {
  return hitters
    .map((h, i) => ({ h, i, score: riskScore(h.cells, arsenal) }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.i - b.i;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score || a.i - b.i;
    })
    .map(({ h }) => h);
}
