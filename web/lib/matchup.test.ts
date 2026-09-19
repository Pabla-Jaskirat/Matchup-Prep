import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ARSENAL_FLOOR_PCT,
  LEAGUE_MARGIN,
  MIN_PITCHES,
  attackShape,
  buildArsenal,
  makeCell,
  standForHand,
  tonightsEdge,
  verdictFor,
} from "./matchup.ts";

const league = { whiff_rate: 0.25, chase_rate: 0.3, avg_est_woba: 0.32 };

function stat(over: Record<string, unknown> = {}) {
  return {
    pitches_seen: 120,
    swings: 60,
    whiffs: 15,
    out_of_zone: 50,
    chases: 15,
    batted_balls: 20,
    whiff_rate: 0.25,
    chase_rate: 0.3,
    avg_est_woba: 0.32,
    avg_exit_velo: 89.1,
    ...over,
  };
}

// ---- the arsenal ---------------------------------------------------------

test("buildArsenal keeps shapes at or above the floor, most-thrown first", () => {
  const rows = [
    { shape_id: "R-SL-1", pitches: 255, season_pitches: 2888 }, //  8.8%
    { shape_id: "R-FF-1", pitches: 1482, season_pitches: 2888 }, // 51.3%
    { shape_id: "R-CH-1", pitches: 32, season_pitches: 2888 }, //  1.1%
  ];
  assert.deepEqual(
    buildArsenal(rows).map((s) => s.shape_id),
    ["R-FF-1", "R-SL-1"],
  );
});

test("buildArsenal reports the share against everything he threw", () => {
  const [top] = buildArsenal([{ shape_id: "R-FF-1", pitches: 500, season_pitches: 2000 }]);
  assert.equal(top.share, 25);
});

test("buildArsenal on a pitcher with no rows is empty, not a crash", () => {
  assert.deepEqual(buildArsenal([]), []);
});

test("the floor is a share, so a reliever and a starter are judged alike", () => {
  assert.equal(ARSENAL_FLOOR_PCT, 3);
  const reliever = buildArsenal([{ shape_id: "R-FF-1", pitches: 9, season_pitches: 300 }]);
  const starter = buildArsenal([{ shape_id: "R-FF-1", pitches: 90, season_pitches: 3000 }]);
  assert.equal(reliever.length, 1);
  assert.equal(starter.length, 1);
});

// ---- the 50-pitch rule ---------------------------------------------------

test("a cell with no row at all is insufficient with zero pitches", () => {
  assert.deepEqual(makeCell(undefined, league), { kind: "insufficient", pitches_seen: 0 });
});

test("a cell below the floor reports how short it fell", () => {
  const cell = makeCell(stat({ pitches_seen: 41 }), league);
  assert.deepEqual(cell, { kind: "insufficient", pitches_seen: 41 });
});

test("the floor is inclusive — exactly 50 pitches is a number", () => {
  assert.equal(MIN_PITCHES, 50);
  assert.equal(makeCell(stat({ pitches_seen: 50 }), league).kind, "value");
  assert.equal(makeCell(stat({ pitches_seen: 49 }), league).kind, "insufficient");
});

test("a value cell carries its counts, not just its rates", () => {
  const cell = makeCell(stat(), league);
  assert.equal(cell.kind, "value");
  if (cell.kind !== "value") return;
  assert.equal(cell.pitches_seen, 120);
  assert.equal(cell.swings, 60);
  assert.equal(cell.whiffs, 15);
});

test("a hitter who cleared the floor but never swung has no whiff rate", () => {
  const cell = makeCell(stat({ swings: 0, whiffs: 0, whiff_rate: null }), league);
  assert.equal(cell.kind, "value");
  if (cell.kind !== "value") return;
  assert.equal(cell.whiff_rate, null);
  assert.equal(cell.whiff_delta, null);
  assert.equal(cell.verdict, null);
});

// ---- comparison to league ------------------------------------------------

test("verdictFor calls a clearly higher whiff rate 'worse' for the hitter", () => {
  assert.equal(verdictFor(0.25 + LEAGUE_MARGIN, 0.25), "worse");
});

test("verdictFor calls a clearly lower whiff rate 'better'", () => {
  assert.equal(verdictFor(0.25 - LEAGUE_MARGIN, 0.25), "better");
});

test("verdictFor calls anything inside the margin 'typical'", () => {
  assert.equal(verdictFor(0.25, 0.25), "typical");
  assert.equal(verdictFor(0.29, 0.25), "typical");
  assert.equal(verdictFor(0.21, 0.25), "typical");
});

test("verdictFor refuses to judge when either side has no rate", () => {
  assert.equal(verdictFor(null, 0.25), null);
  assert.equal(verdictFor(0.25, null), null);
});

// ---- which pitch to attack ----------------------------------------------

test("attackShape picks the hitter's worst pitch relative to league", () => {
  const cells = {
    "R-FF-1": makeCell(stat({ whiff_rate: 0.2 }), league), // 5 better
    "R-SL-1": makeCell(stat({ whiff_rate: 0.34 }), league), // 9 worse
    "R-CU-1": makeCell(stat({ whiff_rate: 0.27 }), league), // 2 worse
  };
  assert.equal(attackShape(cells, ["R-FF-1", "R-SL-1", "R-CU-1"]), "R-SL-1");
});

test("attackShape still answers for a hitter who is better than league everywhere", () => {
  // Guerrero's case: his worst pitch is only his least-good one, and the
  // question "which one do we throw him" still has an answer.
  const cells = {
    "R-FF-1": makeCell(stat({ whiff_rate: 0.1 }), league),
    "R-SL-1": makeCell(stat({ whiff_rate: 0.18 }), league),
  };
  assert.equal(attackShape(cells, ["R-FF-1", "R-SL-1"]), "R-SL-1");
});

test("attackShape ignores shapes outside tonight's arsenal", () => {
  const cells = {
    "R-FF-1": makeCell(stat({ whiff_rate: 0.2 }), league),
    "R-SL-1": makeCell(stat({ whiff_rate: 0.28 }), league),
    "R-KC-1": makeCell(stat({ whiff_rate: 0.9 }), league), // he never throws it
  };
  assert.equal(attackShape(cells, ["R-FF-1", "R-SL-1"]), "R-SL-1");
});

test("attackShape needs two usable cells — one number is not a comparison", () => {
  const cells = {
    "R-FF-1": makeCell(stat(), league),
    "R-SL-1": makeCell(stat({ pitches_seen: 12 }), league),
  };
  assert.equal(attackShape(cells, ["R-FF-1", "R-SL-1"]), null);
});

test("attackShape returns null for a hitter with nothing to show", () => {
  assert.equal(attackShape({}, ["R-FF-1", "R-SL-1"]), null);
});

// ---- tonight's edge ------------------------------------------------------

test("tonightsEdge is the shape that is the attack pitch for the most hitters", () => {
  const edge = tonightsEdge([
    { attack: "R-SL-1" },
    { attack: "R-SL-1" },
    { attack: "R-FF-1" },
    { attack: null },
  ]);
  assert.deepEqual(edge, { shape_id: "R-SL-1", hitters: 2 });
});

test("tonightsEdge breaks a tie by shape id rather than by hash order", () => {
  const edge = tonightsEdge([{ attack: "R-SL-1" }, { attack: "R-FF-1" }]);
  assert.deepEqual(edge, { shape_id: "R-FF-1", hitters: 1 });
});

test("tonightsEdge is null when no hitter has a usable comparison", () => {
  assert.equal(tonightsEdge([{ attack: null }, { attack: null }]), null);
});

// ---- switch-hitters ------------------------------------------------------

test("standForHand picks the side the hitter actually used against that hand", () => {
  const byStand = {
    L: { "R-FF-1": 400, "R-SL-1": 200, "L-FF-1": 3 },
    R: { "L-FF-1": 180, "R-FF-1": 2 },
  };
  assert.equal(standForHand(byStand, "R"), "L");
  assert.equal(standForHand(byStand, "L"), "R");
});

test("standForHand returns the only side an ordinary hitter ever bats from", () => {
  assert.equal(standForHand({ R: { "R-FF-1": 500, "L-FF-1": 200 } }, "L"), "R");
});

test("standForHand returns null when he has never faced that hand", () => {
  assert.equal(standForHand({ R: { "R-FF-1": 500 } }, "L"), null);
});
