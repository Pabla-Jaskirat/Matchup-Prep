import { test } from "node:test";
import assert from "node:assert/strict";

import saved from "./fixtures/schedule-2026-09-23.json" with { type: "json" };
import {
  dayLabel,
  parseSchedule,
  pickGames,
  resultLabel,
  scheduleUrl,
  timeLabel,
  torontoDate,
} from "./schedule.ts";

// A trimmed copy of MLB's real response for Sep 18-30, 2026, fetched on the
// 23rd: a series at Texas, a series at Baltimore with a rainout (Sep 22) made
// up as the first game of a doubleheader, then three at home against
// Cincinnati that close the regular season.
const games = parseSchedule(saved);
const byStart = (iso: string) => games.find((g) => g.start === iso)!;

test("the starter is always the other team's", () => {
  // At Texas: the Rangers' starter.
  const away = byStart("2026-09-20T18:35:00Z");
  assert.equal(away.home, false);
  assert.equal(away.opponent.abbreviation, "TEX");
  assert.equal(away.starter?.name, "Jacob deGrom");
  // At home against the Reds: the Reds' starter.
  const home = byStart("2026-09-25T23:07:00Z");
  assert.equal(home.home, true);
  assert.equal(home.starter?.name, "Nick Lodolo");
});

test("an unannounced starter is null, not a guess", () => {
  // Game 2 of the doubleheader, with Baltimore's starter not yet named.
  type Loose = { dates: { games: { gameDate: string; teams: { home: Record<string, unknown> } }[] }[] };
  const early = structuredClone(saved) as unknown as Loose;
  const game = early.dates.flatMap((d) => d.games).find((g) => g.gameDate === "2026-09-23T22:35:00Z")!;
  delete game.teams.home.probablePitcher;
  const parsed = parseSchedule(early as unknown as typeof saved)
    .find((g) => g.start === "2026-09-23T22:35:00Z")!;
  assert.equal(parsed.starter, null);
  // Our own starter, who is named, is never offered in its place.
  assert.equal(byStart("2026-09-23T22:35:00Z").starter?.name, "Trey Gibson");
});

test("a rainout is dropped even though MLB calls it Final", () => {
  assert.equal(games.find((g) => g.start === "2026-09-22T22:35:00Z"), undefined);
});

test("a finished game carries the score from our side", () => {
  assert.deepEqual(byStart("2026-09-20T18:35:00Z").final, { us: 7, them: 2 });
  assert.deepEqual(byStart("2026-09-21T22:35:00Z").final, { us: 3, them: 4 });
  assert.equal(byStart("2026-09-25T23:07:00Z").final, null);
});

test("spring training and exhibitions are not matchups", () => {
  const spring = structuredClone(saved);
  spring.dates[0].games[0].gameType = "S";
  assert.equal(parseSchedule(spring).length, games.length - 1);
});

test("games come back soonest first", () => {
  const starts = games.map((g) => g.start);
  assert.deepEqual(starts, [...starts].sort());
});

test("during the season the home page shows what is next", () => {
  const { when, games: shown } = pickGames(games, new Date("2026-09-23T20:00:00Z"));
  assert.equal(when, "next");
  assert.deepEqual(
    shown.map((g) => g.start),
    ["2026-09-23T22:35:00Z", "2026-09-25T23:07:00Z", "2026-09-26T19:07:00Z"],
  );
});

test("once the season is over it shows the last games, latest first", () => {
  const over = games.filter((g) => g.final);
  const { when, games: shown } = pickGames(over, new Date("2026-11-15T17:00:00Z"));
  assert.equal(when, "last");
  assert.deepEqual(
    shown.map((g) => g.start),
    ["2026-09-23T17:35:00Z", "2026-09-21T22:35:00Z", "2026-09-20T18:35:00Z"],
  );
});

test("a game long past that MLB never marked Final is not 'next'", () => {
  // As of mid-November, with the Sep 23-27 games still unplayed in this copy:
  // they are stale, so the page falls back to what was actually played.
  const { when, games: shown } = pickGames(games, new Date("2026-11-15T17:00:00Z"));
  assert.equal(when, "last");
  assert.equal(shown[0].start, "2026-09-23T17:35:00Z");
});

test("a game under way is still 'next'", () => {
  const { games: shown } = pickGames(games, new Date("2026-09-24T00:30:00Z"));
  assert.equal(shown[0].start, "2026-09-23T22:35:00Z");
});

test("results read from our side", () => {
  assert.equal(resultLabel({ us: 7, them: 2 }), "W 7-2");
  assert.equal(resultLabel({ us: 3, them: 4 }), "L 3-4");
});

test("day words use the Toronto calendar, not UTC", () => {
  // 10:35 PM UTC on the 23rd is 6:35 PM in Toronto: still today.
  const now = new Date("2026-09-23T14:00:00Z");
  assert.equal(dayLabel("2026-09-23T22:35:00Z", now), "Today");
  // 1:30 AM UTC on the 24th is 9:30 PM on the 23rd in Toronto.
  assert.equal(dayLabel("2026-09-24T01:30:00Z", now), "Today");
  assert.equal(dayLabel("2026-09-24T23:07:00Z", now), "Tomorrow");
  assert.equal(dayLabel("2026-09-25T23:07:00Z", now), "Fri Sep 25");
});

test("times are Toronto times", () => {
  assert.equal(timeLabel("2026-09-25T23:07:00Z"), "7:07 PM");
});

test("the request window reaches back past a whole offseason", () => {
  // In mid-January the last regular-season game is ~3.5 months back.
  const url = scheduleUrl(new Date("2027-01-15T17:00:00Z"));
  const start = url.match(/startDate=([\d-]+)/)![1];
  assert.ok(start < "2026-09-27", start);
  // And "today" is Toronto's: 2 AM UTC on the 24th is still the 23rd there.
  assert.equal(torontoDate(new Date("2026-09-24T02:00:00Z")), "2026-09-23");
});
