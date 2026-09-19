import Link from "next/link";
import { notFound } from "next/navigation";

import HitterRow from "@/components/HitterRow";
import { shortLabel } from "@/lib/labels";
import { getMatchup } from "@/lib/matchup-data";
import { MIN_PITCHES } from "@/lib/matchup";

export const dynamic = "force-dynamic";

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ pitcherId: string }>;
}) {
  const matchup = await getMatchup(Number((await params).pitcherId));

  if ("error" in matchup) {
    if (matchup.status === 404) notFound();
    return (
      <main className="page">
        <Link href="/" className="back">
          ← Pick another pitcher
        </Link>
        <p className="empty">{matchup.error}</p>
      </main>
    );
  }

  const { pitcher, arsenal, hitters, edge } = matchup;
  const hand = pitcher.throws === "L" ? "LHP" : "RHP";

  return (
    <main className="page">
      <Link href="/" className="back">
        ← Pick another pitcher
      </Link>

      <h1>
        {pitcher.name} <span className="hand">{hand}</span>
      </h1>
      <p className="tagline">
        {pitcher.pitches.toLocaleString()} pitches in {matchup.season} ·{" "}
        {arsenal.length} pitch{arsenal.length === 1 ? "" : "es"} he throws at least 3% of
        the time
      </p>

      {edge && (
        <section className="edge">
          <h2>Tonight’s edge</h2>
          <p>
            <strong>{edge.label}</strong> is the pitch {edge.hitters} of our hitters
            handle worst — measured against what he throws, not against each other.
          </p>
        </section>
      )}

      <section className="arsenal">
        <h2>His arsenal</h2>
        <ul className="arsenal-list">
          {arsenal.map((s) => (
            <li key={s.shape_id}>
              <span>{shortLabel(s.label)}</span>
              <span className="arsenal-share">{s.share.toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="hitters-heading">Our hitters</h2>
      <p className="legend">
        Each number is how often that hitter swings and misses at that pitch, from
        anyone who throws it. Colour compares him to the league;{" "}
        <strong>← go here</strong> marks his own worst pitch of the five. Fewer than{" "}
        {MIN_PITCHES} pitches seen and we say so instead of guessing.
      </p>

      <ul className="hitters">
        {hitters.map((h) => (
          <HitterRow key={h.id} hitter={h} arsenal={arsenal} />
        ))}
      </ul>

      <p className="footnote">
        Built from {matchup.season} Statcast. {matchup.unclassified_share.toFixed(1)}% of
        his pitches are not in any shape — pitch types too rare league-wide to measure.
      </p>
    </main>
  );
}
