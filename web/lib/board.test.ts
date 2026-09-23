import { test } from "node:test";
import assert from "node:assert/strict";

import { byRisk, riskScore, sortByShape } from "./board.ts";
import type { Cell } from "./matchup.ts";

const league = { whiff_rate: 0.25, chase_rate: 0.3, avg_est_woba: 0.32 };

function value(whiff_rate: number | null, whiff_delta: number | null = null): Cell {
  return {
    kind: "value",
    pitches_seen: 100,
    swings: 50,
    whiffs: 10,
    out_of_zone: 40,
    chases: 10,
    batted_balls: 20,
    whiff_rate,
    chase_rate: 0.3,
    avg_est_woba: 0.32,
    avg_exit_velo: 89,
    whiff_delta,
    verdict: null,
    league,
  };
}

const thin: Cell = { kind: "insufficient", pitches_seen: 12 };

const hitters = [
  { name: "A", cells: { SL: value(0.2) } },
  { name: "B", cells: { SL: thin } },
  { name: "C", cells: { SL: value(0.4) } },
  { name: "D", cells: { SL: value(null) } },
  { name: "E", cells: { SL: value(0.2) } },
];

test("no pitch chosen keeps the page's own order", () => {
  assert.deepEqual(sortByShape(hitters, null).map((h) => h.name), ["A", "B", "C", "D", "E"]);
});

test("most misses first, ties in the original order", () => {
  assert.deepEqual(sortByShape(hitters, "SL").map((h) => h.name), ["C", "A", "E", "B", "D"]);
});

test("a hitter with no number is never sorted as though he never misses", () => {
  const order = sortByShape(hitters, "SL").map((h) => h.name);
  assert.ok(order.indexOf("B") > order.indexOf("A"));
  assert.ok(order.indexOf("D") > order.indexOf("E"));
});

test("a shape nobody has a cell for leaves the order alone", () => {
  assert.deepEqual(sortByShape(hitters, "CH").map((h) => h.name), ["A", "B", "C", "D", "E"]);
});

// Risk: a starter who throws sliders 60% of the time and changeups 40%.
const arsenal = [
  { shape_id: "SL", share: 60 },
  { shape_id: "CH", share: 40 },
];

test("risk weighs each pitch by how often he throws it", () => {
  // +10 on the slider he throws most, -5 on the changeup: 0.6*10 - 0.4*5 = 4.
  const score = riskScore({ SL: value(0.3, 0.1), CH: value(0.2, -0.05) }, arsenal);
  assert.ok(Math.abs(score! - 0.04) < 1e-9);
});

test("a pitch without a number counts as average, so one thin cell can't decide", () => {
  // +10 on the slider (60% of his pitches), changeup unknown -> 0.6*10 = 6, not 10.
  const score = riskScore({ SL: value(0.3, 0.1), CH: thin }, arsenal);
  assert.ok(Math.abs(score! - 0.06) < 1e-9);
  // So a hitter orange on both beats a hitter with one bigger number.
  const both = riskScore({ SL: value(0.3, 0.08), CH: value(0.3, 0.08) }, arsenal);
  const one = riskScore({ SL: value(0.4, 0.12), CH: thin }, arsenal);
  assert.ok(both! > one!);
});

test("a hitter with no numbers has no risk score, not zero", () => {
  assert.equal(riskScore({ SL: thin, CH: thin }, arsenal), null);
});

test("most trouble first, blank rows last", () => {
  const lineup = [
    { name: "Fine", cells: { SL: value(0.2, -0.03), CH: value(0.2, -0.03) } },
    { name: "Blank", cells: { SL: thin, CH: thin } },
    { name: "Trouble", cells: { SL: value(0.4, 0.12), CH: value(0.3, 0.02) } },
    { name: "Average", cells: { SL: value(0.25, 0), CH: thin } },
  ];
  assert.deepEqual(byRisk(lineup, arsenal).map((h) => h.name), ["Trouble", "Average", "Fine", "Blank"]);
});
