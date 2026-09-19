import {
  chaseSentence,
  contactSentence,
  insufficientSentence,
  whiffSentence,
} from "@/lib/describe";
import { shortLabel } from "@/lib/labels";
import type { Cell } from "@/lib/matchup";
import type { HitterLine, ShapeMeta } from "@/lib/matchup-data";

/**
 * The "why" behind a hitter's row: one block per pitch in tonight's arsenal,
 * in prose rather than in a grid.
 *
 * No percentiles. Every rate carries its counts. A pitch he has not seen
 * enough of says so in a full sentence, because that sentence is the evidence
 * the restraint was deliberate rather than a gap in the data.
 */
export default function HitterDetail({
  hitter,
  arsenal,
}: {
  hitter: HitterLine;
  arsenal: (ShapeMeta & { share: number })[];
}) {
  return (
    <div className="detail">
      {hitter.stand === null && (
        <p className="detail-note">
          He has no 2026 pitches on file against this hand.
        </p>
      )}

      {arsenal.map((shape) => (
        <ShapeDetail
          key={shape.shape_id}
          label={shortLabel(shape.label)}
          share={shape.share}
          cell={hitter.cells[shape.shape_id]}
          attack={hitter.attack === shape.shape_id}
        />
      ))}
    </div>
  );
}

function ShapeDetail({
  label,
  share,
  cell,
  attack,
}: {
  label: string;
  share: number;
  cell: Cell;
  attack: boolean;
}) {
  return (
    <section className="detail-shape">
      <h4>
        {label} <span className="detail-share">{share.toFixed(0)}% of his pitches</span>
        {attack && <span className="detail-flag">his worst of these</span>}
      </h4>

      {!cell || cell.kind === "insufficient" ? (
        <p className="detail-empty">{insufficientSentence(cell?.pitches_seen ?? 0)}</p>
      ) : (
        <>
          <p>{whiffSentence(cell)}</p>
          <p>{chaseSentence(cell)}</p>
          <p className="detail-contact">{contactSentence(cell)}</p>
          <p className="detail-sample">Seen {cell.pitches_seen} times in 2026.</p>
        </>
      )}
    </section>
  );
}
