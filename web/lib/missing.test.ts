import { test } from "node:test";
import assert from "node:assert/strict";

import { missingArsenal, missingSentence } from "./missing.ts";

const imanaga = {
  pitch_type: "FS",
  pitch_name: "Splitter",
  pitches: 932,
  season_pitches: 2765,
  league_pitches: 2242,
  league_pitchers: 30,
};

const rare = { ...imanaga, pitch_type: "EP", pitch_name: "Eephus", pitches: 20 };

// ---- which gaps are worth naming ----------------------------------------

test("missingArsenal keeps a pitch he throws often enough to matter", () => {
  assert.equal(missingArsenal([imanaga]).length, 1);
});

test("missingArsenal drops a pitch below the same 3% floor the arsenal uses", () => {
  assert.deepEqual(missingArsenal([rare]), []); // 20 of 2765 is 0.7%
});

test("missingArsenal reports the share, biggest first", () => {
  const rows = missingArsenal([
    { ...imanaga, pitch_name: "Knuckle-Curve", pitches: 300 },
    imanaga,
  ]);
  assert.deepEqual(rows.map((r) => r.pitch_name), ["Splitter", "Knuckle-Curve"]);
  assert.equal(Math.round(rows[0].share), 34);
});

test("missingArsenal on a pitcher with no gaps is empty", () => {
  assert.deepEqual(missingArsenal([]), []);
});

// ---- the explanation -----------------------------------------------------

test("missingSentence names the pitch and how often he throws it", () => {
  const s = missingSentence(missingArsenal([imanaga])[0], "L");
  assert.match(s, /Splitter/);
  assert.match(s, /34%/);
});

test("missingSentence gives the reason in counts a reader can check", () => {
  const s = missingSentence(missingArsenal([imanaga])[0], "L");
  assert.match(s, /30 left-handers/);
  assert.match(s, /2,242/);
});

test("missingSentence says right-handers for a right-hander", () => {
  const s = missingSentence(missingArsenal([imanaga])[0], "R");
  assert.match(s, /right-handers/);
});

test("missingSentence explains what is missing — a baseline, not the pitch", () => {
  const s = missingSentence(missingArsenal([imanaga])[0], "L");
  assert.match(s, /typical hitter/);
  assert.ok(!/percentile/.test(s));
});

test("missingSentence handles a single pitcher without saying '1 pitchers'", () => {
  const one = missingArsenal([{ ...imanaga, league_pitchers: 1 }])[0];
  assert.match(missingSentence(one, "L"), /1 left-hander /);
});

test("missingSentence ends in a full stop", () => {
  assert.match(missingSentence(missingArsenal([imanaga])[0], "L"), /\.$/);
});
