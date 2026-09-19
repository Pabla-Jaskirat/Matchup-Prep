/**
 * The words on the detail view.
 *
 * Two rules, both of them the point of the screen rather than decoration:
 *
 *   1. The league comparison is words, never a percentile. "73rd percentile"
 *      is a number a coach has to translate; "misses more often than most
 *      hitters do" is the translation.
 *
 *   2. No rate appears without the counts it came from. A 22% whiff rate on
 *      68 swings and on 6 swings are different facts, and the page has no way
 *      to tell them apart if it prints only the percentage.
 */

import type { Cell, Verdict } from "./matchup";

/**
 * Contact quality needs its own, much higher floor. 50 pitches might be 8
 * batted balls, and xwOBA over 8 batted balls is noise wearing a decimal
 * point. This is the "higher threshold for contact quality" PLAN.md called for.
 */
export const MIN_BATTED_BALLS = 25;

const MIN_PITCHES_TEXT = 50;

export function rate(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

/** Baseball prints rate stats without the leading zero: .290, not 0.29. */
export function woba(v: number | null): string {
  if (v === null) return "—";
  const fixed = v.toFixed(3);
  return v < 1 ? fixed.replace(/^0/, "") : fixed;
}

export function compareWords(verdict: Verdict): string {
  return {
    worse: "He misses more often than most hitters do against it",
    better: "He misses less often than most hitters do against it",
    typical: "He misses about as often as most hitters do against it",
  }[verdict];
}

export function insufficientSentence(pitchesSeen: number): string {
  if (pitchesSeen === 0) return "He has not seen this pitch in 2026.";
  const noun = pitchesSeen === 1 ? "pitch" : "pitches";
  return `Not enough data — ${pitchesSeen} ${noun} seen, below the ${MIN_PITCHES_TEXT} threshold.`;
}

type Value = Extract<Cell, { kind: "value" }>;

export function whiffSentence(cell: Value): string {
  if (cell.swings === 0 || cell.whiff_rate === null) {
    return `He has never swung at it — ${cell.pitches_seen} seen.`;
  }
  const head = `Misses ${rate(cell.whiff_rate)} of his swings — ${cell.whiffs} ${
    cell.whiffs === 1 ? "miss" : "misses"
  } on ${cell.swings} swings.`;
  if (!cell.verdict || cell.league.whiff_rate === null) return head;
  return `${head} ${compareWords(cell.verdict)}, at ${rate(cell.league.whiff_rate)}.`;
}

export function chaseSentence(cell: Value): string {
  if (cell.out_of_zone === 0 || cell.chase_rate === null) {
    return "None of them were out of the zone.";
  }
  return `Chases ${rate(cell.chase_rate)} of the ones out of the zone — ${cell.chases} of ${cell.out_of_zone}.`;
}

export function contactSentence(cell: Value): string {
  if (cell.batted_balls < MIN_BATTED_BALLS || cell.avg_est_woba === null) {
    const noun = cell.batted_balls === 1 ? "batted ball" : "batted balls";
    return `Only ${cell.batted_balls} ${noun} — too few to say anything about his contact.`;
  }
  const velo = cell.avg_exit_velo === null ? "" : `, ${cell.avg_exit_velo} mph off the bat`;
  return `${woba(cell.avg_est_woba)} xwOBA on ${cell.batted_balls} batted balls${velo}.`;
}
