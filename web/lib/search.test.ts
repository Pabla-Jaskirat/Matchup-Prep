import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_PITCHES,
  MIN_QUERY_LENGTH,
  RESULT_LIMIT,
  escapeLike,
  isSearchable,
  normalizeQuery,
} from "./search.ts";

test("normalizeQuery turns a missing parameter into an empty string", () => {
  assert.equal(normalizeQuery(null), "");
  assert.equal(normalizeQuery(undefined), "");
});

test("normalizeQuery trims the edges", () => {
  assert.equal(normalizeQuery("  skubal  "), "skubal");
});

test("normalizeQuery collapses runs of whitespace inside the name", () => {
  assert.equal(normalizeQuery("tarik    skubal"), "tarik skubal");
});

test("normalizeQuery caps the length, so a pasted paragraph is not a query", () => {
  assert.equal(normalizeQuery("x".repeat(500)).length, 60);
});

test("normalizeQuery leaves accents alone — the database unaccents both sides", () => {
  assert.equal(normalizeQuery("Giménez"), "Giménez");
});

test("isSearchable rejects one character — every name matches 'a'", () => {
  assert.equal(isSearchable(""), false);
  assert.equal(isSearchable("a"), false);
  assert.equal(isSearchable("sk"), true);
  assert.equal(MIN_QUERY_LENGTH, 2);
});

test("escapeLike defuses the percent wildcard", () => {
  assert.equal(escapeLike("%"), "\\%");
  assert.equal(escapeLike("100%"), "100\\%");
});

test("escapeLike defuses the single-character wildcard", () => {
  assert.equal(escapeLike("a_b"), "a\\_b");
});

test("escapeLike escapes the escape character first, not twice", () => {
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(escapeLike("\\%"), "\\\\\\%");
});

test("escapeLike leaves an ordinary name untouched", () => {
  assert.equal(escapeLike("o'neill-smith jr."), "o'neill-smith jr.");
});

test("the floors are the ones the plan specified", () => {
  assert.equal(MIN_PITCHES, 200);
  assert.equal(RESULT_LIMIT, 10);
});

// --- labels ---------------------------------------------------------------

import { shortLabel } from "./labels.ts";

test("shortLabel drops the handedness prefix the header already shows", () => {
  assert.equal(shortLabel("RHP Splitter 85-88"), "Splitter 85-88");
  assert.equal(shortLabel("LHP Four-Seam"), "Four-Seam");
});

test("shortLabel leaves a label that has no prefix alone", () => {
  assert.equal(shortLabel("Four-Seam"), "Four-Seam");
});
