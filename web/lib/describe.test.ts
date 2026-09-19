import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_BATTED_BALLS,
  compareWords,
  contactSentence,
  chaseSentence,
  insufficientSentence,
  rate,
  whiffSentence,
  woba,
} from "./describe.ts";
import { type Cell, makeCell } from "./matchup.ts";

/** The sentences only accept a value cell. Narrowing here rather than casting
 *  keeps the union honest: if makeCell ever stopped returning one, the test
 *  would fail rather than compile around it. */
function value(cell: Cell): Extract<Cell, { kind: "value" }> {
  assert.equal(cell.kind, "value");
  if (cell.kind !== "value") throw new Error("unreachable");
  return cell;
}

const league = { whiff_rate: 0.16, chase_rate: 0.3, avg_est_woba: 0.32 };

function stat(over: Record<string, unknown> = {}) {
  return {
    pitches_seen: 120, swings: 68, whiffs: 15, out_of_zone: 50, chases: 14,
    batted_balls: 30, whiff_rate: 0.2206, chase_rate: 0.28, avg_est_woba: 0.29,
    avg_exit_velo: 89.1, ...over,
  };
}

// ---- formatting ----------------------------------------------------------

test("rate prints a whole percent", () => {
  assert.equal(rate(0.2206), "22%");
  assert.equal(rate(0.5), "50%");
});

test("rate prints a dash rather than 0% when there is no rate", () => {
  assert.equal(rate(null), "—");
});

test("woba uses the leading-dot form a baseball reader expects", () => {
  assert.equal(woba(0.29), ".290");
  assert.equal(woba(1.015), "1.015");
  assert.equal(woba(null), "—");
});

// ---- the league comparison, in words -------------------------------------

test("compareWords never says a percentile", () => {
  for (const v of ["worse", "typical", "better"] as const) {
    const words = compareWords(v);
    assert.ok(!/percentile|%|\d/.test(words), `"${words}" contains a number`);
  }
});

test("compareWords says what worse means for the hitter, not for us", () => {
  assert.match(compareWords("worse"), /more often than most/);
  assert.match(compareWords("better"), /less often than most/);
  assert.match(compareWords("typical"), /about as often as most/);
});

// ---- the empty state -----------------------------------------------------

test("insufficientSentence names the count and the threshold", () => {
  assert.equal(
    insufficientSentence(41),
    "Not enough data — 41 pitches seen, below the 50 threshold.",
  );
});

test("insufficientSentence reads correctly when he has seen nothing at all", () => {
  assert.equal(insufficientSentence(0), "He has not seen this pitch in 2026.");
});

test("insufficientSentence says pitch, singular, for one pitch", () => {
  assert.match(insufficientSentence(1), /^Not enough data — 1 pitch seen,/);
});

// ---- the sentences -------------------------------------------------------

test("whiffSentence gives the rate, the counts, and the comparison", () => {
  const cell = value(makeCell(stat(), league));
  const sentence = whiffSentence(cell);
  assert.match(sentence, /22%/);
  assert.match(sentence, /15 misses on 68 swings/);
  assert.match(sentence, /more often than most/);
  assert.match(sentence, /at 16%/); // the baseline is named, not just implied
});

test("whiffSentence still reports the count when there is no league baseline", () => {
  const cell = value(makeCell(stat(), { whiff_rate: null, chase_rate: null, avg_est_woba: null }));
  assert.match(whiffSentence(cell), /15 misses on 68 swings/);
  assert.ok(!/than most/.test(whiffSentence(cell)));
});

test("whiffSentence does not invent a rate for a hitter who never swung", () => {
  const cell = value(makeCell(stat({ swings: 0, whiffs: 0, whiff_rate: null }), league));
  assert.match(whiffSentence(cell), /never swung/);
});

test("chaseSentence counts out of the pitches that were actually out of the zone", () => {
  const cell = value(makeCell(stat(), league));
  assert.match(chaseSentence(cell), /28%/);
  assert.match(chaseSentence(cell), /14 of 50/);
});

test("contactSentence refuses to talk about contact on a thin batted-ball sample", () => {
  const cell = value(makeCell(stat({ batted_balls: 9 }), league));
  assert.match(contactSentence(cell), /9 batted balls/);
  assert.ok(!/\.290/.test(contactSentence(cell)));
  assert.equal(MIN_BATTED_BALLS, 25);
});

test("contactSentence reports xwOBA once there are enough batted balls", () => {
  const cell = value(makeCell(stat({ batted_balls: 25 }), league));
  assert.match(contactSentence(cell), /\.290/);
  assert.match(contactSentence(cell), /25 batted balls/);
});

test("every sentence ends in a full stop — they are read as prose", () => {
  const cell = value(makeCell(stat(), league));
  for (const s of [whiffSentence(cell), chaseSentence(cell), contactSentence(cell),
                   insufficientSentence(41), insufficientSentence(0)]) {
    assert.match(s, /\.$/, `"${s}" does not end in a full stop`);
  }
});
