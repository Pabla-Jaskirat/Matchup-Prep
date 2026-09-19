/**
 * The rules for pitcher search, kept out of the route so they can be tested
 * without a database.
 */

/** One letter matches every name. Two is the shortest useful prefix. */
export const MIN_QUERY_LENGTH = 2;

/**
 * A pitcher needs this many 2026 pitches to be worth offering. Below it there
 * is no arsenal to show — a position player who threw a mop-up inning has one
 * shape and forty pitches.
 */
export const MIN_PITCHES = 200;

/** A coach scanning a dropdown will not read past ten names. */
export const RESULT_LIMIT = 10;

const MAX_QUERY_LENGTH = 60;

/** Trim, collapse inner whitespace, and cap the length. Accents are kept: the
 *  database unaccents the stored name and the query together. */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

export function isSearchable(q: string): boolean {
  return q.length >= MIN_QUERY_LENGTH;
}

/**
 * The query goes into a LIKE pattern, so `%` and `_` typed by a person have to
 * stop being wildcards. Without this, a single `%` returns the whole table.
 * The backslash is escaped first, or escaping would escape its own output.
 */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type Pitcher = {
  id: number;
  name: string;
  throws: "L" | "R" | null;
  pitches: number;
};
