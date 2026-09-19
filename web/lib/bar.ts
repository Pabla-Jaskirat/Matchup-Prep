/**
 * Where to draw the whiff-rate bar and the league tick on it.
 *
 * One fixed scale for every chip, so two bars on the same card can be compared
 * by eye. A per-chip scale would make a 12% rate and a 40% rate look identical
 * and would be worse than no bar at all.
 *
 * The scale comes from the data: across the 100 displayable Blue Jays cells,
 * whiff rates run 0.029 to 0.480 and league rates by shape run 0.132 to 0.418.
 * 50% holds all of them. It still clamps, because a scale chosen from one
 * season should not be able to draw outside its own box in the next.
 */

export const BAR_MAX = 0.5;

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function barGeometry(
  rate: number | null,
  league: number | null,
  max: number = BAR_MAX,
): { fill: number | null; tick: number | null } {
  return {
    fill: rate === null ? null : clamp((rate / max) * 100),
    tick: league === null ? null : clamp((league / max) * 100),
  };
}
