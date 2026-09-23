/**
 * The pitches the model cannot see, and why.
 *
 * A pitch type needs 5,000 league pitches before it gets a shape, because a
 * shape exists to carry a league baseline. "Is this hitter worse than most
 * against it?" needs a "most". Under the floor there is no trustworthy most,
 * so the pitch gets no shape and never appears in an arsenal.
 *
 * Shota Imanaga throws a splitter 34% of the time. Without this, his page
 * listed three pitches and a footnote reading "33.7% of his pitches are not in
 * any shape" — which disclosed the gap and explained nothing. A reader cannot
 * tell whether that is a rounding artifact or a third of the man's arsenal.
 */

import { ARSENAL_FLOOR_PCT } from "./matchup.ts";

export type UnshapedRow = {
  pitch_type: string;
  pitch_name: string;
  pitches: number;
  season_pitches: number;
  league_pitches: number;
  league_pitchers: number;
};

export type Missing = UnshapedRow & { share: number };

/** The same 3% floor the arsenal uses: a gap is only worth naming if the pitch
 *  is worth planning for. A position player's one eephus is not. */
export function missingArsenal(
  rows: UnshapedRow[],
  floorPct: number = ARSENAL_FLOOR_PCT,
): Missing[] {
  return rows
    .map((r) => ({
      ...r,
      share: r.season_pitches ? (r.pitches / r.season_pitches) * 100 : 0,
    }))
    .filter((r) => r.share >= floorPct)
    .sort((a, b) => b.share - a.share || a.pitch_name.localeCompare(b.pitch_name));
}

export function missingSentence(m: Missing, throws: "L" | "R"): string {
  const hand = throws === "L" ? "left-hander" : "right-hander";
  const who =
    m.league_pitchers === 1
      ? `1 ${hand} `
      : `${m.league_pitchers.toLocaleString()} ${hand}s `;
  return (
    `${m.pitch_name} — ${Math.round(m.share)}% of what he throws. ` +
    `Only ${who}threw one all season, ${m.league_pitches.toLocaleString()} pitches ` +
    `in total, which is too few to measure what a typical hitter does against it. ` +
    `So there is no average to compare our hitters with, and we would rather say that than guess.`
  );
}
