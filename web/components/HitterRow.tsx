import type { Cell } from "@/lib/matchup";
import type { HitterLine, ShapeMeta } from "@/lib/matchup-data";
import { shortLabel } from "@/lib/labels";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * One hitter, one chip per pitch in tonight's arsenal.
 *
 * Chips rather than table columns: a seven-pitch arsenal would need seven
 * columns, and a phone is 390px wide. Chips wrap.
 */
export default function HitterRow({
  hitter,
  arsenal,
}: {
  hitter: HitterLine;
  arsenal: (ShapeMeta & { share: number })[];
}) {
  const usable = arsenal.filter((s) => hitter.cells[s.shape_id]?.kind === "value").length;

  return (
    <li className="hitter">
      <div className="hitter-head">
        <span className="hitter-name">{hitter.name}</span>
        <span className="hitter-meta">
          {hitter.position}
          {hitter.stand ? ` · bats ${hitter.stand}` : ""}
          {" · "}
          {usable} of {arsenal.length} pitches with enough history
        </span>
      </div>

      <ul className="chips">
        {arsenal.map((shape) => (
          <Chip
            key={shape.shape_id}
            label={shortLabel(shape.label)}
            cell={hitter.cells[shape.shape_id]}
            attack={hitter.attack === shape.shape_id}
          />
        ))}
      </ul>
    </li>
  );
}

function Chip({ label, cell, attack }: { label: string; cell: Cell; attack: boolean }) {
  if (!cell || cell.kind === "insufficient") {
    return (
      <li className="chip chip-thin">
        <span className="chip-label">{label}</span>
        <span className="chip-value">
          {cell?.pitches_seen ?? 0} seen — not enough
        </span>
      </li>
    );
  }

  return (
    <li className={`chip chip-${cell.verdict ?? "typical"}${attack ? " chip-attack" : ""}`}>
      <span className="chip-label">
        {label}
        {attack && <span className="chip-flag"> ← go here</span>}
      </span>
      <span className="chip-value">
        {pct(cell.whiff_rate)} miss
        <span className="chip-count"> on {cell.swings} swings</span>
      </span>
    </li>
  );
}
