import HalvesScatter from "@/components/how/HalvesScatter";
import evidence from "@/data/evidence.json";
import halves from "@/data/halves.json";

/**
 * PARKED: not on /how-it-works right now.
 *
 * The split-half test ("Is it real, or just noise?"): an interactive scatter
 * of every hitter x pitch-group number, first half of the season against the
 * second, plus the chart showing hand + pitch type is the right level of
 * detail. Taken off the page because it was hard to follow for a first-time
 * reader; kept whole so it can come back.
 *
 * To bring it back, render <TheTest shapes={totals.shapes} /> in
 * app/how-it-works/page.tsx, after <PitchStory />. Its data comes from
 * `make reliability` (evidence.json, halves.json) and its styles are the
 * "how it works: the test" and "the scatter" sections of globals.css.
 *
 * It lives in its own file so the page does not ship halves.json (54 KB)
 * while it is parked.
 */
export default function TheTest({ shapes }: { shapes: number }) {
  const chosen =
    evidence.groupings.find((g) => g.groups === shapes) ??
    evidence.groupings[0];
  const bestSpread = Math.max(...evidence.groupings.map((g) => g.spread_real));
  const withSpeed = evidence.groupings.find((g) => g.groups > shapes);

  return (
    <section className="proof" aria-labelledby="proof-title">
      <p className="eyebrow">The test</p>
      <h2 id="proof-title" className="proof-title">
        Is it real, or just noise?
      </h2>
      <p className="proof-lede">
        Easy to claim, so it was measured. Every pitch of the season went into
        one of two random halves, and every number was worked out twice, once
        from each. If a number measures something real, the two halves agree.
      </p>

      <HalvesScatter
        cells={halves.cells}
        rawHalf={chosen.raw_r_half}
        rawFull={chosen.raw_r}
        residualHalf={chosen.residual_r_half}
        residualFull={chosen.residual_r}
        need={evidence.min_swings_per_half * 2}
        maxVsPitcher={evidence.max_swings_vs_pitcher}
      />

      <div className="finding">
        <h3>And hand + pitch type is the right level of detail</h3>
        <p>
          How much real, repeatable difference between hitters each way of
          grouping captures, in percentage points of miss rate:
        </p>
        <ul className="levels">
          {evidence.groupings.map((g) => (
            <li
              key={g.label}
              className={g.spread_real === bestSpread ? "is-best" : ""}
            >
              <span className="levels-name">
                {g.label}{" "}
                <span className="levels-count">{g.groups} groups</span>
              </span>
              <span className="levels-track">
                <span
                  className="levels-fill"
                  style={{
                    width: `${(g.spread_real / (bestSpread * 1.1)) * 100}%`,
                  }}
                />
              </span>
              <span className="levels-value">{g.spread_real.toFixed(1)}</span>
            </li>
          ))}
        </ul>
        <p>
          Coarser groups blur real differences. Ignoring the hand costs half a
          point, because a lefty&rsquo;s slider and a righty&rsquo;s break
          opposite ways.
          {withSpeed && (
            <>
              {" "}
              Adding speed doesn&rsquo;t help either (
              {withSpeed.spread_real.toFixed(1)}): it splits each hitter&rsquo;s
              sample thinner without finding anything new, so the simpler
              version stays.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
