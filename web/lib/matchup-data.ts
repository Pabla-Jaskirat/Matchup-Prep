/**
 * Building a matchup, shared by the API route and the page that renders it.
 *
 * The page is a server component, so it calls this directly rather than
 * fetching its own API over HTTP. One implementation, two entry points: if the
 * page had its own copy of these queries, the 50-pitch rule would eventually
 * be applied in one of them and not the other.
 */

import { query } from "@/lib/db";
import {
  type ArsenalEntry,
  type Cell,
  type LeagueStat,
  type ShapeStat,
  attackShape,
  buildArsenal,
  makeCell,
  standForHand,
  tonightsEdge,
} from "@/lib/matchup";
import { type Missing, type UnshapedRow, missingArsenal } from "@/lib/missing.ts";

const SEASON = 2026;
const METHOD = "v1_type_velo";

/**
 * Four small queries against the aggregate tables. None of them touches
 * `pitches`: that is the whole reason Tasks 13, 14 and 19's migration exist.
 * The largest table read here is hitter_shape_stats at 15,467 rows, and only
 * the fourteen Blue Jays rows of it.
 */
const PITCHER = `
SELECT pl.mlbam_id AS id, pl.full_name AS name, pl.throws,
       coalesce(max(ps.season_pitches), 0) AS season_pitches
FROM players pl
LEFT JOIN pitcher_shape_stats ps
       ON ps.pitcher_id = pl.mlbam_id AND ps.method = $2 AND ps.season = $3
WHERE pl.mlbam_id = $1
GROUP BY 1, 2, 3
`;

const ARSENAL = `
SELECT ps.shape_id, ps.pitches, ps.season_pitches,
       s.label, s.pitch_type, s.velo_min, s.velo_max
FROM pitcher_shape_stats ps
JOIN pitch_shapes s ON s.method = ps.method AND s.shape_id = ps.shape_id
WHERE ps.pitcher_id = $1 AND ps.method = $2 AND ps.season = $3
ORDER BY ps.pitches DESC
`;

const HITTERS = `
SELECT mlbam_id AS id, full_name AS name, position
FROM players
WHERE team = 'TOR' AND position <> 'P'
ORDER BY full_name
`;

// Every Jays row, both sides. Which side applies tonight is decided from the
// data itself -- players deliberately carries no batting hand, because a
// switch-hitter does not have one.
const HITTER_STATS = `
SELECT h.batter_id, h.stand, h.shape_id,
       h.pitches_seen, h.swings, h.whiffs, h.out_of_zone, h.chases,
       h.batted_balls, h.whiff_rate, h.chase_rate, h.avg_est_woba, h.avg_exit_velo
FROM hitter_shape_stats h
JOIN players pl ON pl.mlbam_id = h.batter_id
WHERE h.method = $1 AND h.season = $2 AND pl.team = 'TOR' AND pl.position <> 'P'
`;

// What he throws that has no shape, and the league counts that explain why.
const UNSHAPED = `
SELECT pitch_type, pitch_name, pitches, season_pitches,
       league_pitches, league_pitchers
FROM pitcher_unshaped_stats
WHERE pitcher_id = $1 AND method = $2 AND season = $3
`;

const LEAGUE = `
SELECT stand, shape_id, whiff_rate, chase_rate, avg_est_woba
FROM league_shape_stats WHERE method = $1 AND season = $2
`;

const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

export type ShapeMeta = {
  shape_id: string;
  label: string;
  pitch_type: string;
  velo_min: number | null;
  velo_max: number | null;
};

export type HitterLine = {
  id: number;
  name: string;
  position: string;
  stand: string | null;
  cells: Record<string, Cell>;
  attack: string | null;
};

export type Matchup = {
  season: number;
  method: string;
  pitcher: { id: number; name: string; throws: "L" | "R"; pitches: number };
  arsenal: (ArsenalEntry & ShapeMeta)[];
  unclassified_share: number;
  hitters: HitterLine[];
  /** Pitches he throws often enough to plan for that the model cannot rate. */
  missing: Missing[];
  edge: { shape_id: string; hitters: number; label: string } | null;
  ms: number;
};

/** A reason the matchup cannot be built, rather than an exception. */
export type MatchupError = { error: string; status: 400 | 404 };

export async function getMatchup(pitcherId: number): Promise<Matchup | MatchupError> {
  const started = Date.now();
  if (!Number.isInteger(pitcherId) || pitcherId <= 0) {
    return { error: "That pitcher id is not a number.", status: 400 };
  }
  const [pitcherRows, arsenalRows, hitterRows, statRows, leagueRows, unshapedRows] =
    await Promise.all([
    query<{ id: number; name: string; throws: "L" | "R" | null; season_pitches: string }>(
      PITCHER,
      [pitcherId, METHOD, SEASON],
    ),
    query<Record<string, string | number | null>>(ARSENAL, [pitcherId, METHOD, SEASON]),
    query<{ id: number; name: string; position: string }>(HITTERS),
    query<Record<string, string | number | null>>(HITTER_STATS, [METHOD, SEASON]),
    query<Record<string, string | number | null>>(LEAGUE, [METHOD, SEASON]),
    query<Record<string, string | number | null>>(UNSHAPED, [pitcherId, METHOD, SEASON]),
  ]);

  const pitcher = pitcherRows[0];
  if (!pitcher) {
    return { error: `No pitcher with id ${pitcherId}.`, status: 404 };
  }
  if (!pitcher.throws) {
    return { error: `${pitcher.name} has no throwing hand on file.`, status: 404 };
  }
  if (arsenalRows.length === 0) {
    return { error: `${pitcher.name} threw no classified pitches in ${SEASON}.`, status: 404 };
  }

  const arsenal: (ArsenalEntry & ShapeMeta)[] = buildArsenal(
    arsenalRows.map((r) => ({
      shape_id: String(r.shape_id),
      pitches: Number(r.pitches),
      season_pitches: Number(r.season_pitches),
    })),
  ).map((entry) => {
    const meta = arsenalRows.find((r) => r.shape_id === entry.shape_id)!;
    return {
      ...entry,
      label: String(meta.label),
      pitch_type: String(meta.pitch_type),
      velo_min: num(meta.velo_min),
      velo_max: num(meta.velo_max),
    };
  });
  const arsenalIds = arsenal.map((a) => a.shape_id);

  const league = new Map<string, LeagueStat>();
  for (const r of leagueRows) {
    league.set(`${r.stand}|${r.shape_id}`, {
      whiff_rate: num(r.whiff_rate),
      chase_rate: num(r.chase_rate),
      avg_est_woba: num(r.avg_est_woba),
    });
  }

  // batter -> stand -> shape -> stat
  const byHitter = new Map<number, Record<string, Record<string, ShapeStat>>>();
  for (const r of statRows) {
    const batter = Number(r.batter_id);
    const stand = String(r.stand);
    const sides = byHitter.get(batter) ?? {};
    (sides[stand] ??= {})[String(r.shape_id)] = {
      pitches_seen: Number(r.pitches_seen),
      swings: Number(r.swings),
      whiffs: Number(r.whiffs),
      out_of_zone: Number(r.out_of_zone),
      chases: Number(r.chases),
      batted_balls: Number(r.batted_balls),
      whiff_rate: num(r.whiff_rate),
      chase_rate: num(r.chase_rate),
      avg_est_woba: num(r.avg_est_woba),
      avg_exit_velo: num(r.avg_exit_velo),
    };
    byHitter.set(batter, sides);
  }

  const hitters = hitterRows.map((h) => {
    const sides = byHitter.get(h.id) ?? {};
    const counts: Record<string, Record<string, number>> = {};
    for (const [stand, shapes] of Object.entries(sides)) {
      counts[stand] = Object.fromEntries(
        Object.entries(shapes).map(([shape, s]) => [shape, s.pitches_seen]),
      );
    }
    const stand = standForHand(counts, pitcher.throws!);
    const mine = stand ? sides[stand] : {};

    const cells: Record<string, Cell> = {};
    for (const shape_id of arsenalIds) {
      cells[shape_id] = makeCell(mine?.[shape_id], league.get(`${stand}|${shape_id}`));
    }
    return {
      id: h.id,
      name: h.name,
      position: h.position,
      stand,
      cells,
      attack: attackShape(cells, arsenalIds),
    };
  });

  const edge = tonightsEdge(hitters);

  return {
    season: SEASON,
    method: METHOD,
    pitcher: {
      id: pitcher.id,
      name: pitcher.name,
      throws: pitcher.throws,
      pitches: Number(pitcher.season_pitches),
    },
    arsenal,
    // What the arsenal leaves out: pitches whose type never cleared the
    // 5,000-pitch league floor, plus shapes under 3%.
    unclassified_share:
      100 - arsenalRows.reduce((sum, r) => sum + Number(r.pitches), 0) /
        Number(pitcher.season_pitches) * 100,
    hitters,
    missing: missingArsenal(
      unshapedRows.map((r) => ({
        pitch_type: String(r.pitch_type),
        pitch_name: String(r.pitch_name),
        pitches: Number(r.pitches),
        season_pitches: Number(r.season_pitches),
        league_pitches: Number(r.league_pitches),
        league_pitchers: Number(r.league_pitchers),
      })) satisfies UnshapedRow[],
    ),
    edge: edge
      ? { ...edge, label: arsenal.find((a) => a.shape_id === edge.shape_id)?.label ?? edge.shape_id }
      : null,
    ms: Date.now() - started,
  };
}
