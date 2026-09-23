"use client";

import { useRouter } from "next/navigation";

import PitcherSearch from "./PitcherSearch";

/** The search box, wired to the matchup page. The one client piece of the
 *  home page, so the rest of it can render on the server. */
export default function SearchToMatchup({ label }: { label?: string }) {
  const router = useRouter();
  return <PitcherSearch label={label} onSelect={(p) => router.push(`/matchup/${p.id}`)} />;
}
