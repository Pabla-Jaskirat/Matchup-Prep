import Link from "next/link";

import Headshot from "@/components/Headshot";
import SearchToMatchup from "@/components/SearchToMatchup";
import { dayLabel, resultLabel, timeLabel } from "@/lib/schedule";
import { type Upcoming, getUpcoming } from "@/lib/upcoming";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { when, games } = await getUpcoming();
  const now = new Date();

  return (
    <main className="page">
      <h1 className="home-title">Who are we facing?</h1>
      <p className="tagline">
        Pick the opposing starter. See which of his pitches each Blue Jays hitter
        handles.
      </p>

      {games.length > 0 && (
        <section aria-labelledby="next-games">
          <h2 id="next-games">{when === "next" ? "Next games" : "Recent games"}</h2>
          <ul className="games">
            {games.map((g) => (
              <li key={g.gamePk}>
                <GameCard game={g} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <SearchToMatchup label={games.length > 0 ? "Or search any pitcher" : undefined} />

      <p className="how-link">
        <Link href="/how-it-works">How this works, in six steps →</Link>
      </p>
    </main>
  );
}

function GameCard({ game, now }: { game: Upcoming; now: Date }) {
  const where = `${game.home ? "vs" : "@"} ${game.opponent.abbreviation}`;
  const when = (
    <span className="game-when">
      {game.live && <span className="game-live">Live</span>}
      <span>
        {game.live ? "" : dayLabel(game.start, now)}
        {game.live || game.final || game.startTbd ? "" : ` · ${timeLabel(game.start)}`}
        {game.live ? where : ` · ${where}`}
        {game.final && (
          <span className={`game-result${game.final.us > game.final.them ? " is-win" : ""}`}>
            {` · ${resultLabel(game.final)}`}
          </span>
        )}
      </span>
    </span>
  );

  if (!game.starter || !game.hasData) {
    return (
      <div className="game game-off">
        <span className="game-body">
          {when}
          <span className="game-name">
            {game.starter ? game.starter.name : `${game.opponent.name} starter TBD`}
          </span>
          {game.starter && <span className="game-sub">No 2026 pitches on file</span>}
        </span>
      </div>
    );
  }

  return (
    <Link href={`/matchup/${game.starter.id}`} className="game">
      <Headshot id={game.starter.id} size={48} />
      <span className="game-body">
        {when}
        <span className="game-name">{game.starter.name}</span>
      </span>
      <span className="game-go" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
