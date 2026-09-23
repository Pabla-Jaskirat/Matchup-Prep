/**
 * The Jays' next few games and who is starting against them, from MLB's
 * public schedule API — or, when there are none (the offseason, which is
 * five months of the year), the last few they played.
 *
 * Parsing and date wording live here, apart from the fetch, so they can be
 * tested against a saved response instead of whatever MLB says today.
 */

export const JAYS_TEAM_ID = 141;
/** The clubhouse clock: "today" means today in Toronto, not on the server. */
export const TZ = "America/Toronto";
/** Far enough ahead that an off-day or a road trip still leaves games to show. */
const LOOKAHEAD_DAYS = 7;
/** Far enough back that in January the last regular-season series is still in
 *  the window. One request either way, cached. */
const LOOKBACK_DAYS = 240;
/** Regular season and the four postseason rounds. Spring training and
 *  exhibitions are left out: a March split-squad starter is not a matchup. */
const COUNTED = new Set(["R", "F", "D", "L", "W"]);
export const MAX_GAMES = 3;

export type Game = {
  gamePk: number;
  /** Start time, ISO. */
  start: string;
  startTbd: boolean;
  home: boolean;
  opponent: { id: number; name: string; abbreviation: string };
  starter: { id: number; name: string } | null;
  live: boolean;
  /** Set once the game is over: our runs, theirs. */
  final: { us: number; them: number } | null;
};

type Side = {
  team: { id: number; name: string; teamName?: string; abbreviation?: string };
  probablePitcher?: { id: number; fullName: string };
  score?: number;
};

type ApiGame = {
  gamePk: number;
  gameDate: string;
  gameType?: string;
  status: { abstractGameState: string; detailedState?: string; startTimeTBD?: boolean };
  teams: { home: Side; away: Side };
};

/**
 * Every counted game, soonest first. The starter is the one on the *other*
 * side: this app is about the pitcher our hitters face.
 *
 * MLB marks a postponed or cancelled game "Final" too. Those are dropped: no
 * pitch was thrown, and the makeup appears as its own game.
 */
export function parseSchedule(
  body: { dates?: { games: ApiGame[] }[] },
  teamId: number = JAYS_TEAM_ID,
): Game[] {
  const games: Game[] = [];
  for (const date of body.dates ?? []) {
    for (const g of date.games) {
      if (g.gameType && !COUNTED.has(g.gameType)) continue;
      const over = g.status.abstractGameState === "Final";
      const home = g.teams.home.team.id === teamId;
      const us = home ? g.teams.home : g.teams.away;
      const them = home ? g.teams.away : g.teams.home;
      const played = typeof us.score === "number" && typeof them.score === "number";
      if (over && (!played || /postponed|cancel|suspend/i.test(g.status.detailedState ?? ""))) {
        continue;
      }
      games.push({
        gamePk: g.gamePk,
        start: g.gameDate,
        startTbd: g.status.startTimeTBD === true,
        home,
        opponent: {
          id: them.team.id,
          name: them.team.teamName ?? them.team.name,
          abbreviation: them.team.abbreviation ?? them.team.name,
        },
        starter: them.probablePitcher
          ? { id: them.probablePitcher.id, name: them.probablePitcher.fullName }
          : null,
        live: g.status.abstractGameState === "Live",
        final: over ? { us: us.score!, them: them.score! } : null,
      });
    }
  }
  return games.sort((a, b) => a.start.localeCompare(b.start));
}

/** A game that started this long ago and is still not Final is stale data,
 *  not tonight's game. The longest games run about six hours. */
const STALE_MS = 12 * 3_600_000;

/**
 * What the home page shows: the next games while there are any, otherwise the
 * most recent ones, latest first. Never empty just because it is November.
 */
export function pickGames(
  games: Game[],
  now: Date,
  max: number = MAX_GAMES,
): { when: "next" | "last"; games: Game[] } {
  const ahead = games.filter(
    (g) => !g.final && new Date(g.start).getTime() > now.getTime() - STALE_MS,
  );
  if (ahead.length > 0) return { when: "next", games: ahead.slice(0, max) };
  return { when: "last", games: games.filter((g) => g.final).slice(-max).reverse() };
}

/** "W 7-2" / "L 3-4", from our side. */
export function resultLabel(final: { us: number; them: number }): string {
  return `${final.us > final.them ? "W" : "L"} ${final.us}-${final.them}`;
}

/** YYYY-MM-DD for an instant, on the Toronto calendar. */
export function torontoDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at);
}

/** "Today", "Tomorrow", or "Thu Sep 25". */
export function dayLabel(start: string, now: Date): string {
  const day = torontoDate(new Date(start));
  const today = torontoDate(now);
  const tomorrow = torontoDate(new Date(now.getTime() + 86_400_000));
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(new Date(start))
    .replace(",", "");
}

/** "7:07 PM", in Toronto time. */
export function timeLabel(start: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(start));
}

export function scheduleUrl(now: Date, teamId: number = JAYS_TEAM_ID): string {
  const start = torontoDate(new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000));
  const end = torontoDate(new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000));
  return (
    "https://statsapi.mlb.com/api/v1/schedule?sportId=1" +
    `&teamId=${teamId}&startDate=${start}&endDate=${end}&hydrate=probablePitcher,team`
  );
}
