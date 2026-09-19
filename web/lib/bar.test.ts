import { test } from "node:test";
import assert from "node:assert/strict";

import { BAR_MAX, barGeometry } from "./bar.ts";

test("the scale is the one the data asked for", () => {
  // Measured across the 100 displayable Blue Jays cells: whiff rates run
  // 0.029 to 0.480, and league rates by shape run 0.132 to 0.418. A 50% scale
  // holds every one of them with nothing clipped.
  assert.equal(BAR_MAX, 0.5);
});

test("half the scale fills half the bar", () => {
  assert.deepEqual(barGeometry(0.25, null), { fill: 50, tick: null });
});

test("the league tick sits at its own place on the same scale", () => {
  const { fill, tick } = barGeometry(0.3, 0.2);
  assert.equal(fill, 60);
  assert.equal(tick, 40);
});

test("a rate beyond the scale fills the bar rather than overflowing it", () => {
  assert.equal(barGeometry(0.9, null).fill, 100);
});

test("a league rate beyond the scale is pinned to the end, not lost", () => {
  assert.equal(barGeometry(0.2, 0.75).tick, 100);
});

test("zero is zero, not an empty bar with a hidden sliver", () => {
  assert.equal(barGeometry(0, null).fill, 0);
});

test("no rate means no bar to draw", () => {
  assert.deepEqual(barGeometry(null, 0.2), { fill: null, tick: 40 });
});

test("no league baseline means no tick, and the bar still draws", () => {
  assert.deepEqual(barGeometry(0.25, null), { fill: 50, tick: null });
});

test("a negative rate cannot pull the bar off the left edge", () => {
  assert.equal(barGeometry(-0.1, null).fill, 0);
});
