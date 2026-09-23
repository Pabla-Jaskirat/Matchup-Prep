import { test } from "node:test";
import assert from "node:assert/strict";

import { BASE_Y, H, W, layout } from "./dots.ts";

// Guerrero against Skenes, as frozen in explainer.json.
const columns = [
  { from_him: 9, from_everyone: 439 },
  { from_him: 6, from_everyone: 141 },
  { from_him: 2, from_everyone: 73 },
  { from_him: 2, from_everyone: 325 },
];
const L = layout(columns, 50);

test("one dot per pitch, his own included in the column's total", () => {
  assert.equal(L.dots.length, 439 + 141 + 73 + 325);
  assert.equal(L.dots.filter((d) => d.him).length, 19);
});

test("every dot stays inside the picture", () => {
  for (const d of L.dots) {
    assert.ok(d.x - L.radius >= 0 && d.x + L.radius <= W, `x ${d.x}`);
    assert.ok(d.y - L.radius >= 0 && d.y + L.radius <= H, `y ${d.y}`);
  }
});

test("a column's height is its count: 50 pitches reach exactly the floor line", () => {
  const rows50 = 50 / L.perRow;
  assert.equal(L.floorY, BASE_Y - rows50 * L.pitch);
  // The 50th dot of the tallest column sits at or just under the line.
  const col0 = L.dots.filter((d) => d.col === 0);
  assert.ok(col0[49].y - L.pitch / 2 >= L.floorY - L.pitch);
});

test("his pitches sit at the bottom of each column", () => {
  for (let c = 0; c < columns.length; c++) {
    const col = L.dots.filter((d) => d.col === c);
    const him = col.filter((d) => d.him);
    const others = col.filter((d) => !d.him);
    assert.ok(Math.max(...him.map((d) => d.row)) <= Math.min(...others.map((d) => d.row)));
  }
});

test("in the first scene his 19 pitches fill 19 distinct slots of the 50", () => {
  const boxed = L.dots.filter((d) => d.him).map((d) => `${d.boxX},${d.boxY}`);
  assert.equal(new Set(boxed).size, 19);
  assert.equal(L.slots.length, 50);
});

test("columns never overlap", () => {
  for (let c = 0; c < columns.length; c++) {
    const xs = L.dots.filter((d) => d.col === c).map((d) => d.x);
    assert.ok(Math.min(...xs) - L.radius >= L.colX(c));
    assert.ok(Math.max(...xs) + L.radius <= L.colX(c) + L.colW);
  }
});
