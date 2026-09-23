"use client";

import { useMemo, useState } from "react";

import Headshot from "./Headshot";
import Legend from "./Legend";
import { byRisk, sortByShape } from "@/lib/board";
import { columnLabel, shortLabel, surname } from "@/lib/labels";
import type { Cell } from "@/lib/matchup";
import type { HitterLine, ShapeMeta } from "@/lib/matchup-data";

type Shape = ShapeMeta & { share: number };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * His arsenal and our whole lineup against it, on one screen.
 *
 * Hitters down the side, his pitches across the top, one cell each. A pitch
 * that gives the lineup trouble shows up as an orange column before anyone
 * reads a number; that is the reason this is a grid and not a card per hitter.
 *
 * It opens with the hitters he is most likely to trouble first. Tapping a
 * pitch, in the arsenal or in a column heading, sorts the lineup by who misses
 * that one most; tap it again to go back.
 *
 * A real <table>: a screen reader announces the hitter and the pitch for every
 * cell, which a grid of divs cannot do.
 */
export default function MatchupBoard({
  arsenal,
  hitters,
}: {
  arsenal: Shape[];
  hitters: HitterLine[];
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const toggle = (id: string) => setFocus((f) => (f === id ? null : id));
  // Most trouble against his pitches first; a tapped pitch re-sorts that.
  const ranked = useMemo(() => byRisk(hitters, arsenal), [hitters, arsenal]);
  const rows = sortByShape(ranked, focus);
  const focused = arsenal.find((s) => s.shape_id === focus);

  return (
    <>
      <section className="arsenal">
        <h2>His arsenal</h2>
        <div className="usage" aria-hidden="true">
          {arsenal.map((s, i) => (
            <span
              key={s.shape_id}
              className={`usage-seg${focus === s.shape_id ? " is-focus" : ""}`}
              style={{ flexGrow: s.share, background: `var(--mix-${Math.min(i, 6)})` }}
            />
          ))}
        </div>
        <ul className="usage-key">
          {arsenal.map((s, i) => (
            <li key={s.shape_id}>
              <button
                type="button"
                className="usage-item"
                aria-pressed={focus === s.shape_id}
                onClick={() => toggle(s.shape_id)}
              >
                <span
                  className="usage-swatch"
                  style={{ background: `var(--mix-${Math.min(i, 6)})` }}
                  aria-hidden="true"
                />
                {shortLabel(s.label)}
                <span className="usage-share">{s.share.toFixed(0)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="hitters-heading">Our hitters against him</h2>
      <p className="legend">
        How often each hitter swings and misses at each pitch, against anyone who
        throws it. The hitters most likely to struggle against him come first. Tap a
        pitch to sort by that one.
      </p>
      <Legend />

      <p className="board-status" role="status" aria-live="polite">
        {focused ? (
          <>
            Most misses on the <strong>{shortLabel(focused.label)}</strong> first.{" "}
            <button type="button" className="link-button" onClick={() => setFocus(null)}>
              Reset
            </button>
          </>
        ) : null}
      </p>

      <div className="board-scroll">
        <table className="board">
          <thead>
            <tr>
              <th scope="col" className="board-corner">
                Hitter
              </th>
              {arsenal.map((s) => {
                const { name, band } = columnLabel(s.label);
                const on = focus === s.shape_id;
                return (
                  <th
                    key={s.shape_id}
                    scope="col"
                    aria-sort={on ? "descending" : undefined}
                    className={on ? "is-focus" : undefined}
                  >
                    <button
                      type="button"
                      className="col-button"
                      aria-pressed={on}
                      onClick={() => toggle(s.shape_id)}
                    >
                      <span className="col-name">{name}</span>
                      {band && <span className="col-band">{band}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <th scope="row" className="board-hitter">
                  <span className="board-hitter-in">
                    <Headshot id={h.id} size={28} />
                    <span className="board-id">
                      <span className="board-name">{surname(h.name)}</span>
                      <span className="board-meta">
                        {h.position}
                        {h.stand ? ` · bats ${h.stand}` : ""}
                      </span>
                    </span>
                  </span>
                </th>
                {arsenal.map((s) => (
                  <BoardCell
                    key={s.shape_id}
                    cell={h.cells[s.shape_id]}
                    hitter={h.name}
                    pitch={shortLabel(s.label)}
                    watch={h.attack === s.shape_id}
                    focus={focus === s.shape_id}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * One hitter against one pitch: the miss rate, and under it the swings the
 * rate is built on, so 40% on 9 swings never passes for 40% on 90.
 */
function BoardCell({
  cell,
  hitter,
  pitch,
  watch,
  focus,
}: {
  cell: Cell | undefined;
  hitter: string;
  pitch: string;
  watch: boolean;
  focus: boolean;
}) {
  const extra = `${watch ? " is-watch" : ""}${focus ? " is-focus" : ""}`;

  if (!cell || cell.kind === "insufficient") {
    const seen = cell?.pitches_seen ?? 0;
    return (
      <td className={`cell cell-thin${extra}`} title={`${hitter} has seen ${seen} of these`}>
        <span className="cell-rate" aria-hidden="true">—</span>
        <span className="sr-only">not enough pitches: {seen} seen</span>
      </td>
    );
  }

  const said =
    cell.whiff_rate === null
      ? `${hitter} has never swung at the ${pitch}`
      : `${hitter} misses ${pct(cell.whiff_rate)} of ${cell.swings} swings at the ${pitch}` +
        (cell.league.whiff_rate === null ? "" : `; MLB average ${pct(cell.league.whiff_rate)}`);

  return (
    <td className={`cell cell-${cell.verdict ?? "typical"}${extra}`} title={said}>
      <span className="cell-rate">{pct(cell.whiff_rate)}</span>
      <span className="cell-n">{cell.swings}</span>
      <span className="sr-only">
        {" "}
        on {cell.swings} swings
        {watch ? ", his weakest pitch compared with the average" : ""}
      </span>
    </td>
  );
}
