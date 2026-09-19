import { BAR_MAX, CHASE_BAR_MAX, WOBA_BAR_MAX, barGeometry } from "@/lib/bar";
import { MIN_BATTED_BALLS, compareWords, insufficientSentence, rate, woba } from "@/lib/describe";
import { shortLabel } from "@/lib/labels";
import type { Cell } from "@/lib/matchup";
import type { HitterLine, ShapeMeta } from "@/lib/matchup-data";

/**
 * The "why" behind a hitter's row.
 *
 * Was four sentences per pitch, which on a six-pitch arsenal meant
 * twenty-four sentences before a coach reached the bottom. Now each metric is
 * one row: what it is, a bar with the league marked on it, the number, and
 * the counts the number came from.
 *
 * The league comparison is still words — that is the point of the screen, and
 * the words carry no percentile — but it is one short phrase beside the bar
 * rather than a clause inside a sentence.
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
        <p className="detail-note">He has no 2026 pitches on file against this hand.</p>
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
        <dl className="stats">
          <Stat
            term="Swings and misses"
            value={rate(cell.whiff_rate)}
            fill={barGeometry(cell.whiff_rate, cell.league.whiff_rate, BAR_MAX)}
            note={
              cell.swings === 0
                ? "he has never swung at it"
                : `${cell.whiffs} on ${cell.swings} swings`
            }
            words={
              cell.verdict && cell.league.whiff_rate !== null
                ? `${compareWords(cell.verdict)}, at ${rate(cell.league.whiff_rate)}`
                : null
            }
            tone={cell.verdict ?? undefined}
          />

          <Stat
            term="Chases out of the zone"
            value={rate(cell.chase_rate)}
            fill={barGeometry(cell.chase_rate, cell.league.chase_rate, CHASE_BAR_MAX)}
            note={
              cell.out_of_zone === 0
                ? "none were out of the zone"
                : `${cell.chases} of ${cell.out_of_zone}`
            }
            words={
              cell.league.chase_rate !== null
                ? `league ${rate(cell.league.chase_rate)}`
                : null
            }
          />

          {cell.batted_balls >= MIN_BATTED_BALLS && cell.avg_est_woba !== null ? (
            <Stat
              term="Damage on contact"
              value={woba(cell.avg_est_woba)}
              fill={barGeometry(cell.avg_est_woba, cell.league.avg_est_woba, WOBA_BAR_MAX)}
              note={`${cell.batted_balls} batted balls${
                cell.avg_exit_velo === null ? "" : `, ${cell.avg_exit_velo} mph`
              }`}
              words={
                cell.league.avg_est_woba !== null
                  ? `league ${woba(cell.league.avg_est_woba)} xwOBA`
                  : null
              }
            />
          ) : (
            <Stat
              term="Damage on contact"
              value="—"
              fill={{ fill: null, tick: null }}
              note={`${cell.batted_balls} batted balls — too few to say`}
              words={null}
            />
          )}

          <div className="stat-seen">Seen {cell.pitches_seen} times in 2026.</div>
        </dl>
      )}
    </section>
  );
}

function Stat({
  term,
  value,
  fill,
  note,
  words,
  tone,
}: {
  term: string;
  value: string;
  fill: { fill: number | null; tick: number | null };
  note: string;
  words: string | null;
  tone?: "worse" | "typical" | "better";
}) {
  return (
    <>
      <dt>{term}</dt>
      <dd>
        <span className="stat-row">
          <span className={`bar${tone ? ` bar-${tone}` : ""}`} aria-hidden="true">
            {fill.fill !== null && (
              <span className="bar-fill" style={{ width: `${fill.fill}%` }} />
            )}
            {fill.tick !== null && (
              <span className="bar-tick" style={{ left: `${fill.tick}%` }} />
            )}
          </span>
          <span className="stat-value">{value}</span>
        </span>
        <span className="stat-note">
          {words ? `${words} · ` : ""}
          {note}
        </span>
      </dd>
    </>
  );
}
