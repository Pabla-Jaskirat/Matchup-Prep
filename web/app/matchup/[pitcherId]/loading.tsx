/**
 * Shown while the server component waits on the database. The skeleton has
 * the same shape and spacing as the real page, so nothing jumps when the data
 * lands — including on a cold Neon branch, where the wait is about three
 * seconds.
 */
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <p className="back">← Pick another pitcher</p>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-edge" />
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-board" />
      <p className="sr-only" role="status">
        Loading the matchup.
      </p>
    </main>
  );
}
