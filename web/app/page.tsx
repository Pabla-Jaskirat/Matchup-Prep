"use client";

import { useState } from "react";

import PitcherSearch from "@/components/PitcherSearch";
import type { Pitcher } from "@/lib/search";

export default function Home() {
  const [chosen, setChosen] = useState<Pitcher | null>(null);

  return (
    <main className="page">
      <h1>Matchup Prep</h1>
      <p className="tagline">
        Pick tonight’s starter. See which of his pitches each Blue Jays hitter handles.
      </p>

      <PitcherSearch onSelect={setChosen} />

      {chosen && (
        <section className="chosen">
          <h2>
            {chosen.name} · {chosen.throws === "L" ? "LHP" : "RHP"}
          </h2>
          <p>
            {chosen.pitches.toLocaleString()} pitches thrown in 2026. The hitter breakdown
            arrives in Task 19.
          </p>
        </section>
      )}
    </main>
  );
}
