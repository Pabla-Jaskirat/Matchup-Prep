/**
 * The home page's "who are we facing" list: MLB's probable starters, checked
 * against what this app can actually show.
 *
 * A starter only gets a link if he has an arsenal in the database. A link to
 * a pitcher with no 2026 shapes would land on a 404, which is worse than an
 * honest "no data" on the home page.
 *
 * Any failure here (MLB down, slow, or changed its format) returns an empty
 * list. The search box below still works; the home page must never break
 * because someone else's API did.
 */

import { query } from "@/lib/db";
import { METHOD, SEASON } from "@/lib/matchup-data";
import { type Game, parseSchedule, pickGames, scheduleUrl } from "@/lib/schedule";

export type Upcoming = Game & { hasData: boolean };
export type GameList = { when: "next" | "last"; games: Upcoming[] };
const NONE: GameList = { when: "next", games: [] };

const WITH_ARSENAL = `
SELECT DISTINCT pitcher_id
FROM pitcher_shape_stats
WHERE pitcher_id = ANY($1::int[]) AND method = $2 AND season = $3
`;

export async function getUpcoming(now: Date = new Date()): Promise<GameList> {
  try {
    const res = await fetch(scheduleUrl(now), {
      // Probables change a few times a day; half an hour is fresh enough. A
      // whole season is ~620 KB, inside Next's 2 MB fetch-cache limit.
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NONE;
    const { when, games } = pickGames(parseSchedule(await res.json()), now);

    const ids = games.flatMap((g) => (g.starter ? [g.starter.id] : []));
    const known = new Set<number>();
    if (ids.length > 0) {
      const rows = await query<{ pitcher_id: number }>(WITH_ARSENAL, [ids, METHOD, SEASON]);
      for (const r of rows) known.add(Number(r.pitcher_id));
    }
    return {
      when,
      games: games.map((g) => ({ ...g, hasData: g.starter !== null && known.has(g.starter.id) })),
    };
  } catch {
    return NONE;
  }
}
