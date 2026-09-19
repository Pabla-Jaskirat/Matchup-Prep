import { test } from "node:test";
import assert from "node:assert/strict";

import { hostOf, isPooled, requireUrl } from "./db.ts";

// A fake that has the shape of a Neon string and none of the secrecy.
const POOLED = "postgresql://user:pw@ep-fake-123-pooler.us-east-1.aws.neon.tech/db?sslmode=require";
const DIRECT = "postgresql://user:pw@ep-fake-123.us-east-1.aws.neon.tech/db?sslmode=require";

test("hostOf returns the hostname and nothing else", () => {
  assert.equal(hostOf(POOLED), "ep-fake-123-pooler.us-east-1.aws.neon.tech");
});

test("hostOf never leaks the credential", () => {
  const shown = hostOf(POOLED);
  assert.ok(!shown.includes("pw"), `credential leaked: ${shown}`);
  assert.ok(!shown.includes("user"), `credential leaked: ${shown}`);
});

test("hostOf on an unparseable string returns a placeholder, not the string", () => {
  assert.equal(hostOf("not a url"), "unknown");
});

test("isPooled recognises the -pooler host", () => {
  assert.equal(isPooled(POOLED), true);
});

test("isPooled rejects the direct host — serverless must not use it", () => {
  assert.equal(isPooled(DIRECT), false);
});

test("requireUrl reads DATABASE_URL_POOLED", () => {
  assert.equal(requireUrl({ DATABASE_URL_POOLED: POOLED }), POOLED);
});

test("requireUrl throws when the variable is missing", () => {
  assert.throws(() => requireUrl({}), /DATABASE_URL_POOLED/);
});

test("requireUrl treats whitespace as missing", () => {
  assert.throws(() => requireUrl({ DATABASE_URL_POOLED: "   " }), /DATABASE_URL_POOLED/);
});

test("requireUrl ignores DATABASE_URL — the direct string is not a fallback", () => {
  assert.throws(() => requireUrl({ DATABASE_URL: DIRECT }), /DATABASE_URL_POOLED/);
});

test("the thrown message does not contain the value it rejected", () => {
  try {
    requireUrl({ DATABASE_URL_POOLED: "   " });
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(!String(err).includes("pw"));
  }
});
