import { MIN_PITCHES } from "@/lib/matchup";

/**
 * What the colours mean, as a key rather than a paragraph.
 *
 * This replaced four lines of prose that every reader had to get through
 * before the first hitter. A key is read once and then skipped, which is what
 * a legend is for.
 */
export default function Legend() {
  return (
    <ul className="key">
      <li>
        <span className="key-swatch key-worse" aria-hidden="true" />
        misses more than league
      </li>
      <li>
        <span className="key-swatch key-typical" aria-hidden="true" />
        about the same
      </li>
      <li>
        <span className="key-swatch key-better" aria-hidden="true" />
        misses less
      </li>
      <li>
        <span className="key-tick" aria-hidden="true" />
        league rate for that pitch
      </li>
      <li>
        <span className="key-flag">← go here</span>
        his worst of tonight’s
      </li>
      <li>
        <span className="key-swatch key-thin" aria-hidden="true" />
        under {MIN_PITCHES} pitches — no number
      </li>
    </ul>
  );
}
