import Link from "next/link";

import facts from "@/data/explainer.json";
import { shortLabel } from "@/lib/labels";

export const metadata = { title: "How it works — Matchup Prep" };

const n = (v: number) => v.toLocaleString();

export default function HowItWorks() {
  const { example, groups, shapes, totals, floors, below_floor, split_test } = facts;
  const rarest = below_floor[0];
  const biggest = example.by_shape[0];
  const widestIqr = Math.max(...groups.map((g) => g.iqr));
  const biggestShape = shapes[0].pitches;
  // The groups the retired velocity rule would have cut into bands, measured
  // rather than listed here: build_explainer re-reads that rule's shape file
  // and counts what the split cost.
  const wouldSplit = new Set(
    (split_test?.groups ?? []).map((g) => `${g.hand}-${g.pitch_type}`),
  );
  // Clearing the old spread line was not enough on its own: three slices of a
  // group this size would each have fallen under the band floor. The widest
  // bar on the chart below is one of these, so the page has to say why it
  // carries no tag -- it read as a contradiction otherwise.
  const tooThin = groups.filter(
    (g) =>
      split_test != null &&
      g.iqr > split_test.split_above_iqr &&
      !wouldSplit.has(`${g.hand}-${g.pitch_type}`),
  );

  return (
    <main className="page">
      <Link href="/" className="back">
        ← Back to the app
      </Link>

      <h1 className="how-title">How this works</h1>
      <p className="tagline">
        Six steps, with the real {example.hitter_short}-versus-{example.pitcher_short}{" "}
        numbers at each one.
      </p>

      {/* 1 ------------------------------------------------------------- */}
      <Step num={1} title="Facing a pitcher tells you almost nothing">
        <p>
          {example.hitter} saw <strong>{example.head_to_head} pitches</strong> from{" "}
          {example.pitcher} all season. Across every pitcher he faced, the average is{" "}
          {example.avg_per_pitcher} and the most he ever saw from one man is{" "}
          {example.max_per_pitcher}.
        </p>
        <Compare
          rows={[
            { label: `From ${example.pitcher}`, value: example.head_to_head, tone: "thin" },
            { label: "Most from any one pitcher", value: example.max_per_pitcher, tone: "thin" },
            { label: `The floor to print a number`, value: floors.cell_pitches, tone: "rule" },
          ]}
          max={floors.cell_pitches}
        />
        <p className="step-note">
          Nothing on the left reaches the line. That is the problem this tool exists to
          get around.
        </p>
      </Step>

      {/* 2 ------------------------------------------------------------- */}
      <Step num={2} title="So describe the pitch, not the pitcher">
        <p>
          Every pitch gets two labels: which hand threw it, and what kind of pitch it
          is. Nothing about who threw it.
        </p>
        <div className="pitchcard">
          <span>
            <em>hand</em>
            {example.pitcher_hand}HP
          </span>
          <span aria-hidden="true" className="plus">
            +
          </span>
          <span>
            <em>type</em>
            {shortLabel(biggest.label).replace(/\s\d.*$/, "")}
          </span>
          <span aria-hidden="true" className="arrow">
            →
          </span>
          <span className="pitchcard-out">
            <em>shape</em>
            {biggest.shape_id}
          </span>
        </div>
        <p className="step-note">
          The hand is not a formality. A sweeper breaks away from the arm that threw
          it, so against a left-handed hitter a lefty&rsquo;s sweeper runs off the plate
          and a righty&rsquo;s runs into the bat path. Same label, 5.4 points apart on
          whiff rate — more than the whole hitter-by-pitch signal this page is about.
        </p>
      </Step>

      {/* 3 ------------------------------------------------------------- */}
      <Step num={3} title="Speed was the obvious third label. We measured it and dropped it.">
        <p>
          Each bar is how much that pitch varies across the league — the gap between a
          typically slow one and a typically fast one. An earlier version cut the
          widest-spreading ones into three speed bands each, on the theory that a 73 mph
          curveball and an 87 mph curveball are different pitches to stand in against.
        </p>
        <ul className="iqr">
          {groups.map((g) => {
            const key = `${g.hand}-${g.pitch_type}`;
            const marked = wouldSplit.has(key);
            const thin = tooThin.some((t) => `${t.hand}-${t.pitch_type}` === key);
            return (
              <li key={key} className={marked ? "split" : thin ? "collapsed" : ""}>
                <span className="iqr-name">
                  {g.hand}HP {g.name}
                  {marked && <span className="iqr-tag">was split</span>}
                  {thin && <span className="iqr-tag iqr-tag-muted">too few to split</span>}
                </span>
                <span className="iqr-track">
                  <span
                    className="iqr-fill"
                    style={{ width: `${(g.iqr / (widestIqr * 1.05)) * 100}%` }}
                  />
                  {split_test?.split_above_iqr != null && (
                    <span
                      className="iqr-cut"
                      style={{
                        left: `${(split_test.split_above_iqr / (widestIqr * 1.05)) * 100}%`,
                      }}
                    />
                  )}
                </span>
                <span className="iqr-value">{g.iqr.toFixed(1)}</span>
              </li>
            );
          })}
        </ul>
        {split_test && (
          <>
            <Compare
              rows={[
                {
                  label: "Jays numbers, pitches kept whole",
                  value: split_test.cells_whole,
                  tone: "good",
                },
                {
                  label: "Jays numbers, pitches split by speed",
                  value: split_test.cells_split,
                  tone: "thin",
                },
              ]}
              max={Math.max(split_test.cells_whole, 1)}
            />
            <p className="step-note">
              The theory was fine and the cost was not. Splitting those{" "}
              {split_test.groups.length} pitches gave{" "}
              <strong>{split_test.cells_split} usable Blue Jays numbers</strong>, because
              a hitter&rsquo;s sample gets divided along with the pitch — the most any
              Jay managed against a single band was {split_test.best_split_cell} pitches,
              under the {floors.cell_pitches} a number needs. Kept whole, the same
              pitches give <strong>{split_test.cells_whole}</strong>.
            </p>
            {tooThin[0] && (
              <p className="step-note">
                Spread alone was never enough. {tooThin[0].hand}HP{" "}
                {tooThin[0].name.toLowerCase()}s vary the most of anything in baseball
                at {tooThin[0].iqr.toFixed(1)} mph and were still left whole even then:
                three slices of {n(tooThin[0].pitches)} pitches would be about{" "}
                {n(Math.round(tooThin[0].pitches / 3))} each, under the{" "}
                {n(split_test.min_band_pitches)} a band needed.
              </p>
            )}
            <p className="step-note">
              Splitting also did not measure any better: {totals.shapes} shapes capture
              5.0 points of real hitter-by-pitch difference and{" "}
              {split_test.shapes_then} capture 4.9. So the shape is a hand and a pitch
              type, and speed is not part of it.
            </p>
          </>
        )}
        <p className="step-note">
          Pitches too rare to measure never get here at all. The biggest of them is the{" "}
          {rarest.hand}HP {rarest.name.toLowerCase()} — {n(rarest.pitches)} thrown all
          season by {rarest.pitchers} pitchers, under the {n(floors.group_pitches)} a
          pitch type needs before it can be a shape.
        </p>
      </Step>

      {/* 4 ------------------------------------------------------------- */}
      <Step num={4} title={`Every pitch in baseball lands in one of ${totals.shapes}`}>
        <p>
          {n(totals.assigned)} of {n(totals.typed)} pitches — {totals.assigned_pct}%. The
          rest are pitch types too rare to measure, and the app says so by name rather
          than hiding them.
        </p>
        <ul className="shapebars">
          {shapes.map((s) => (
            <li key={s.shape_id}>
              <span className="shapebars-name">{s.label}</span>
              <span className="shapebars-track">
                <span
                  className="shapebars-fill"
                  style={{ width: `${(s.pitches / biggestShape) * 100}%` }}
                />
              </span>
              <span className="shapebars-value">{n(s.pitches)}</span>
            </li>
          ))}
        </ul>
      </Step>

      {/* 5 ------------------------------------------------------------- */}
      <Step num={5} title="Now the sample is big enough to mean something">
        <p>
          Re-count {example.hitter_short}’s {example.head_to_head} pitches from{" "}
          {example.pitcher} by <em>shape</em>, then ask how many of that shape he has
          seen from <strong>anyone</strong>.
        </p>
        <table className="grow">
          <thead>
            <tr>
              <th>Shape</th>
              <th>From {example.pitcher_short}</th>
              <th>From everyone</th>
            </tr>
          </thead>
          <tbody>
            {example.by_shape.map((s) => (
              <tr key={s.shape_id} className={s.from_everyone >= floors.cell_pitches ? "usable" : ""}>
                <td>{shortLabel(s.label)}</td>
                <td className="num">{s.from_him}</td>
                <td className="num">
                  <span className="grow-bar" style={{ width: `${(s.from_everyone / biggest.from_everyone) * 92}%` }} />
                  {n(s.from_everyone)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="step-note">
          His sinker: <strong>{biggest.from_him} pitches</strong> becomes{" "}
          <strong>{n(biggest.from_everyone)}</strong>. Same pitch, {" "}
          {Math.round(biggest.from_everyone / biggest.from_him)}× the evidence. Rows that
          clear the {floors.cell_pitches}-pitch floor are the ones that get a number.
        </p>
      </Step>

      {/* 6 ------------------------------------------------------------- */}
      <Step num={6} title="The report is the overlap">
        <p>
          Tonight’s starter throws a handful of shapes — anything at least{" "}
          {floors.arsenal_pct}% of his pitches. Cross those against what each of our{" "}
          {totals.hitters} hitters has done against those same shapes, and that is the
          page.
        </p>
        <div className="venn">
          <span className="venn-side">
            <strong>His arsenal</strong>
            {totals.shapes} shapes exist · he throws 3–7 of them
          </span>
          <span className="venn-mid" aria-hidden="true">
            ∩
          </span>
          <span className="venn-side">
            <strong>Their history</strong>
            every pitch of that shape, from anyone
          </span>
        </div>
      </Step>

      <section className="how-honest">
        <h2>What this is not</h2>
        <p>
          This is the standard approach, not a new one — public stuff models like Stuff+
          and PitchingBot are built on the same premise. The judgment here is in the
          floors: {floors.group_pitches.toLocaleString()} league pitches before a pitch
          type is a shape, {floors.cell_pitches} before a hitter’s number is printed, and
          a sentence instead of a number whenever it falls short.
        </p>
        <p className="step-note">
          Numbers on this page are from {facts.season} Statcast, frozen on{" "}
          {facts.generated}. They are measured by a script and committed as data, so the
          page never has to query the 696,100-row pitch table to explain itself.
        </p>
      </section>
    </main>
  );
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <section className="step">
      <h2>
        <span className="step-num" aria-hidden="true">
          {num}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Compare({
  rows,
  max,
}: {
  rows: { label: string; value: number; tone: string }[];
  max: number;
}) {
  return (
    <ul className="compare">
      {rows.map((r) => (
        <li key={r.label} className={`compare-${r.tone}`}>
          <span className="compare-label">{r.label}</span>
          <span className="compare-track">
            <span className="compare-fill" style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }} />
          </span>
          <span className="compare-value">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
