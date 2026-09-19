import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import {
  MIN_PITCHES,
  RESULT_LIMIT,
  escapeLike,
  isSearchable,
  normalizeQuery,
  type Pitcher,
} from "@/lib/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEASON = 2026;

/**
 * Substring match, not fuzzy match. A coach types letters that are actually in
 * the name; returning Skubal for "scoobal" would be clever and untrustworthy.
 * Trigram similarity only breaks ties among the names that already matched.
 *
 * `search_name` is the unaccented, lowercased generated column from migration
 * 007, and the GIN trigram index on it is what makes the LIKE fast.
 *
 * The pitch count is a correlated subquery rather than a join over all of
 * `pitches`: it runs once per matched name, against `pitches_pitcher_idx`,
 * instead of grouping 696,100 rows to answer a three-letter query.
 */
const SQL = `
WITH term AS (
    SELECT immutable_unaccent(lower($1)) AS t
),
matched AS (
    SELECT p.mlbam_id, p.full_name, p.throws, p.search_name
    FROM players p, term
    WHERE p.search_name LIKE '%' || term.t || '%'
),
counted AS MATERIALIZED (
    SELECT m.*,
           (SELECT count(*) FROM pitches pi
             WHERE pi.pitcher_id = m.mlbam_id AND pi.season = $2) AS pitches
    FROM matched m
)
SELECT c.mlbam_id AS id, c.full_name AS name, c.throws, c.pitches
FROM counted c, term
WHERE c.pitches >= $3
ORDER BY (c.search_name LIKE term.t || '%') DESC,
         similarity(c.search_name, term.t) DESC,
         c.pitches DESC,
         c.full_name ASC
LIMIT $4
`;

type Row = { id: number; name: string; throws: "L" | "R" | null; pitches: string };

export async function GET(request: Request) {
  const q = normalizeQuery(new URL(request.url).searchParams.get("q"));

  // An empty box is not an error and not a reason to touch the database.
  if (!isSearchable(q)) {
    return NextResponse.json({ q, pitchers: [] satisfies Pitcher[] });
  }

  try {
    const rows = await query<Row>(SQL, [escapeLike(q), SEASON, MIN_PITCHES, RESULT_LIMIT]);
    const pitchers: Pitcher[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      throws: r.throws,
      pitches: Number(r.pitches),
    }));
    return NextResponse.json({ q, pitchers });
  } catch (err) {
    console.error("pitcher search failed:", err);
    return NextResponse.json(
      { q, pitchers: [], error: err instanceof Error ? err.name : "Error" },
      { status: 503 },
    );
  }
}
