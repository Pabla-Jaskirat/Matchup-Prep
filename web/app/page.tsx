"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import PitcherSearch from "@/components/PitcherSearch";

export default function Home() {
  const router = useRouter();

  return (
    <main className="page">
      <h1>Matchup Prep</h1>
      <p className="tagline">
        Pick tonight’s starter. See which of his pitches each Blue Jays hitter handles.
      </p>

      <PitcherSearch onSelect={(p) => router.push(`/matchup/${p.id}`)} />

      <p className="how-link">
        <Link href="/how-it-works">How this works, in six steps →</Link>
      </p>

    </main>
  );
}
