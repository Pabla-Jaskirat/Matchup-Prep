import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1>No matchup for that pitcher</h1>
      <p className="empty">
        Either the id is not a pitcher, or he threw nothing classifiable in 2026.
      </p>
      <Link href="/" className="back">
        ← Pick another pitcher
      </Link>
    </main>
  );
}
