import Headshot from "./Headshot";
import { barGeometry } from "@/lib/bar";
import HitterDetail from "./HitterDetail";
import { shortLabel } from "@/lib/labels";
import type { Cell } from "@/lib/matchup";
import type { HitterLine, ShapeMeta } from "@/lib/matchup-data";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * One hitter: a row of chips you can scan, and a disclosure with the words.
 *
 * Chips rather than table columns — a seven-pitch arsenal would need seven
 * columns and a phone is 390px wide, so they wrap instead.
 *
 * The detail is a <details> element rather than React state: it opens on tap
 * and on Enter, announces its own expanded state to a screen reader, needs no
 * JavaScript, and cannot shift the layout when it opens because the content
 * was rendered on the server and is already there.
 *
 * The chips stay outside the <summary>. A <summary> may only contain phrasing
 * content, and a list is not phrasing content; browsers would render it, a
 * validator would not accept it.
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
        <Headshot id={hitter.id} size={48} />
        <div className="hitter-id">
          <span className="hitter-name">{hitter.name}</span>
          <span className="hitter-meta">
            {hitter.position}
            {hitter.stand ? ` · bats ${hitter.stand}` : ""}
            {" · "}
            {usable} of {arsenal.length} with enough history
          </span>
        </div>
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

      <details className="why">
        <summary>Why — {hitter.name.split(" ").slice(-1)[0]} pitch by pitch</summary>
        <HitterDetail hitter={hitter} arsenal={arsenal} />
      </details>
    </li>
  );
}

function Chip({ label, cell, attack }: { label: string; cell: Cell; attack: boolean }) {
  if (!cell || cell.kind === "insufficient") {
    return (
      <li className="chip chip-thin">
        <span className="chip-label">{label}</span>
        <span className="bar bar-empty" aria-hidden="true" />
        <span className="chip-value">not enough</span>
        <span className="chip-count">{cell?.pitches_seen ?? 0} pitches seen</span>
      </li>
    );
  }

  // The bar is decorative: the rate and the swing count sit right under it in
  // text, so a screen reader gets the number rather than a description of a
  // rectangle.
  const { fill, tick } = barGeometry(cell.whiff_rate, cell.league.whiff_rate);

  return (
    <li className={`chip chip-${cell.verdict ?? "typical"}${attack ? " chip-attack" : ""}`}>
      <span className="chip-label">
        {label}
        {attack && <span className="chip-flag"> ← go here</span>}
      </span>
      <span className="bar" aria-hidden="true">
        {fill !== null && <span className="bar-fill" style={{ width: `${fill}%` }} />}
        {tick !== null && <span className="bar-tick" style={{ left: `${tick}%` }} />}
      </span>
      {/* Two fixed lines rather than one wrapping sentence: "23% miss on 71
          swings" broke across the chip at phone width and left every card
          ragged. The rate leads, the sample sits under it. */}
      <span className="chip-value">{pct(cell.whiff_rate)} miss</span>
      <span className="chip-count">on {cell.swings} swings</span>
    </li>
  );
}
