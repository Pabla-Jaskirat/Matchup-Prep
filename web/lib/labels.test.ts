import { test } from "node:test";
import assert from "node:assert/strict";

import { columnLabel, shortLabel, surname } from "./labels.ts";

test("shortLabel drops the hand", () => {
  assert.equal(shortLabel("RHP Splitter 85-88"), "Splitter 85-88");
  assert.equal(shortLabel("LHP Sweeper"), "Sweeper");
});

test("columnLabel splits the speed band onto its own line", () => {
  assert.deepEqual(columnLabel("RHP Splitter 85-88"), { name: "Splitter", band: "85-88" });
  assert.deepEqual(columnLabel("RHP Curveball 83+"), { name: "Curve", band: "83+" });
  assert.deepEqual(columnLabel("RHP Curveball under 79"), { name: "Curve", band: "under 79" });
});

test("columnLabel shortens the names too wide for a phone column", () => {
  assert.deepEqual(columnLabel("RHP Four-Seam"), { name: "4-Seam", band: null });
  assert.deepEqual(columnLabel("RHP Knuckle-Curve"), { name: "K-Curve", band: null });
  assert.deepEqual(columnLabel("LHP Changeup"), { name: "Change", band: null });
  assert.deepEqual(columnLabel("LHP Cutter"), { name: "Cutter", band: null });
});

test("surname keeps a suffix with the name it belongs to", () => {
  assert.equal(surname("Vladimir Guerrero Jr."), "Guerrero Jr.");
  assert.equal(surname("George Springer"), "Springer");
  assert.equal(surname("Andrés Giménez"), "Giménez");
  assert.equal(surname("Ichiro"), "Ichiro");
});
