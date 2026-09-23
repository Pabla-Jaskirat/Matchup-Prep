import { MIN_PITCHES } from "@/lib/matchup";

/**
 * What the grid's colours and marks mean, as a key rather than a paragraph.
 *
 * Written from our side of the field: orange is a warning for a Jays hitter,
 * green is good news. A key is read once and then skipped, which is what a
 * legend is for, so it stays to four entries.
 */
export default function Legend() {
  return (
    <ul className="key">
      <li>
        <span className="key-swatch key-worse" aria-hidden="true" />
        <span className="key-swatch key-typical" aria-hidden="true" />
        <span className="key-swatch key-better" aria-hidden="true" />
        misses more / about the same / less than the MLB average
      </li>
      <li>
        <span className="key-watch" aria-hidden="true" />
        his weakest pitch, compared with the average
      </li>
      <li>
        {/* A miniature grid cell, so the small number reads as part of one:
            on its own, "71" looked like it came from nowhere. */}
        <span className="key-cell" aria-hidden="true">
          <span className="key-cell-rate">23%</span>
          <span className="key-cell-n">71</span>
        </span>
        miss rate, and how many swings it&rsquo;s from
      </li>
      <li>
        <span className="key-mark" aria-hidden="true">—</span>
        fewer than {MIN_PITCHES} pitches seen, so no number
      </li>
    </ul>
  );
}
