import Link from "next/link";
import { notFound } from "next/navigation";

import Headshot from "@/components/Headshot";
import HitterRow from "@/components/HitterRow";
import Legend from "@/components/Legend";
import { shortLabel } from "@/lib/labels";
import { getMatchup } from "@/lib/matchup-data";
import { missingSentence } from "@/lib/missing";

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

  const { pitcher, arsenal, hitters, edge, missing } = matchup;
  const hand = pitcher.throws === "L" ? "LHP" : "RHP";

  return (
    <main className="page">
      <Link href="/" className="back">
        ← Pick another pitcher
      </Link>

      <header className="pitcher-head">
        <Headshot id={pitcher.id} size={96} className="headshot-lg" />
        <div>
          <h1>
            {pitcher.name} <span className="hand">{hand}</span>
          </h1>
          <p className="tagline">
            {pitcher.pitches.toLocaleString()} pitches in {matchup.season} ·{" "}
            {arsenal.length} pitch{arsenal.length === 1 ? "" : "es"} he throws at least
            3% of the time
          </p>
        </div>
      </header>

      {edge && (
        <section className="edge">
          <h2>Tonight’s edge</h2>
          <p>
            <strong>{edge.hitters} of our {hitters.length} hitters</strong> handle{" "}
            <strong>{shortLabel(edge.label)}</strong> worse than anything else he
            throws.
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
        How often each hitter swings and misses at that pitch — against anyone who
        throws it, not just him.
      </p>
      <Legend />

      <ul className="hitters">
        {hitters.map((h) => (
          <HitterRow key={h.id} hitter={h} arsenal={arsenal} />
        ))}
      </ul>

      {missing.length > 0 && (
        <section className="missing">
          <h2>What we can’t show you</h2>
          {missing.map((m) => (
            <p key={m.pitch_type}>{missingSentence(m, pitcher.throws)}</p>
          ))}
        </section>
      )}

      <p className="how-link">
        <Link href="/how-it-works">How these numbers are built →</Link>
      </p>

      <p className="footnote">
        Built from {matchup.season} Statcast.{" "}
        {matchup.unclassified_share.toFixed(1)}% of his pitches sit outside the
        {" "}shapes above.
      </p>
    </main>
  );
}
