import Link from "next/link";

import facts from "@/data/explainer.json";
import { shortLabel } from "@/lib/labels";

export const metadata = { title: "How it works — Matchup Prep" };

const n = (v: number) => v.toLocaleString();

export default function HowItWorks() {
  const { example, groups, shapes, totals, floors, below_floor } = facts;
  const rarest = below_floor[0];
  const split = groups.filter((g) => g.bands > 1);
  // Clears the spread test and still came back as one shape, because three
  // bands of its size would each fall under the band floor.
  const collapsed = groups.filter((g) => g.iqr > floors.iqr_for_bands && g.bands === 1);
  const biggest = example.by_shape[0];
  const widestIqr = Math.max(...groups.map((g) => g.iqr));
  const biggestShape = shapes[0].pitches;

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
          Every pitch gets three labels: which hand threw it, what kind of pitch it is,
          and how hard. Nothing about who threw it.
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
          <span aria-hidden="true" className="plus">
            +
          </span>
          <span>
            <em>speed</em>
            {/\d/.test(biggest.label)
              ? shortLabel(biggest.label).replace(/^\D+/, "")
              : "all speeds"}
          </span>
          <span aria-hidden="true" className="arrow">
            →
          </span>
          <span className="pitchcard-out">
            <em>shape</em>
            {biggest.shape_id}
          </span>
        </div>
      </Step>

      {/* 3 ------------------------------------------------------------- */}
      <Step num={3} title="Speed only splits a pitch when speed actually varies">
        <p>
          Each bar is how much that pitch varies across the league — the gap between a
          typically slow one and a typically fast one. Past{" "}
          <strong>{floors.iqr_for_bands} mph</strong> the slow and fast versions are
          different pitches and get split. Below it they are the same pitch.
        </p>
        <ul className="iqr">
          {groups.map((g) => (
            <li
              key={`${g.hand}-${g.pitch_type}`}
              className={g.bands > 1 ? "split" : g.iqr > floors.iqr_for_bands ? "collapsed" : ""}
            >
              <span className="iqr-name">
                {g.hand}HP {g.name}
                {g.bands > 1 && <span className="iqr-tag">{g.bands} bands</span>}
                {g.bands === 1 && g.iqr > floors.iqr_for_bands && (
                  <span className="iqr-tag iqr-tag-muted">too few to split</span>
                )}
              </span>
              <span className="iqr-track">
                <span className="iqr-fill" style={{ width: `${(g.iqr / (widestIqr * 1.05)) * 100}%` }} />
                <span
                  className="iqr-cut"
                  style={{ left: `${(floors.iqr_for_bands / (widestIqr * 1.05)) * 100}%` }}
                />
              </span>
              <span className="iqr-value">{g.iqr.toFixed(1)}</span>
            </li>
          ))}
        </ul>
        <p className="step-note">
          {groups.filter((g) => g.iqr > floors.iqr_for_bands).length} groups clear the
          line; <strong>{split.length}</strong> actually get split. {collapsed[0]?.hand}HP{" "}
          {collapsed[0]?.name}s vary the most of anything in baseball and still end up as
          one shape: three slices of {n(collapsed[0]?.pitches ?? 0)} pitches would be
          about {n(Math.round((collapsed[0]?.pitches ?? 0) / 3))} each, under the{" "}
          {n(floors.band_pitches)} a band needs. The spread earns the split; the sample
          size can overrule it.
        </p>
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
