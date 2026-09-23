import Link from "next/link";

import PitchStory from "@/components/how/PitchStory";
import evidence from "@/data/evidence.json";
import facts from "@/data/explainer.json";
import { LEAGUE_MARGIN } from "@/lib/matchup";

export const metadata = { title: "How it works — Matchup Prep" };

const n = (v: number) => v.toLocaleString();

/** Sample sizes for the "Why 50?" chart; the floor's own row is marked. */
const SWING_STEPS = [10, 25, 50, 100];
/** The example hitter's miss rate in that chart: a typical one. */
const BASE_RATE = 20;

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** "RHP Sinker" -> "Righty sinker": the hand in words, not a scouting code. */
const handName = (hand: string) => (hand === "L" ? "Lefty" : "Righty");
const plainLabel = (label: string) =>
  label.replace(/^([LR])HP\s+(.*)$/, (_, h: string, rest: string) => `${handName(h)} ${rest.toLowerCase()}`);

/**
 * The explainer, in three layers.
 *
 *   1. The idea, told with the pitches themselves: one dot per pitch, in a
 *      picture that changes as the reader scrolls (PitchStory).
 *   2. Why the line is at 50, since every scene is measured against it.
 *   3. Details, collapsed, for anyone who wants the reasoning behind a choice.
 *
 * The split-half test used to sit between 1 and 2. It is parked, whole, in
 * components/how/TheTest.tsx.
 *
 * Every number comes from a file a script wrote (explainer.json from
 * build_explainer, evidence.json from reliability), never typed into this
 * page, so the page cannot drift from what was measured.
 */
export default function HowItWorks() {
  const { example, groups, shapes, totals, floors, below_floor, split_test } = facts;
  const hand = facts.hand_example;
  const rarest = below_floor[0];
  const widestIqr = Math.max(...groups.map((g) => g.iqr));
  const biggestShape = shapes[0].pitches;
  const handWord = example.pitcher_hand === "L" ? "left-hander" : "right-hander";


  // The groups the retired velocity rule would have cut into bands, measured
  // rather than listed here: build_explainer re-reads that rule's shape file
  // and counts what the split cost.
  const wouldSplit = new Set(
    (split_test?.groups ?? []).map((g) => `${g.hand}-${g.pitch_type}`),
  );
  // Clearing the old spread line was not enough on its own: three slices of a
  // group this size would each have fallen under the band floor. The widest
  // bar on the chart is one of these, so the page says why it carries no tag.
  const tooThin = groups.filter(
    (g) =>
      split_test != null &&
      g.iqr > split_test.split_above_iqr &&
      !wouldSplit.has(`${g.hand}-${g.pitch_type}`),
  );

  return (
    <main className="page how">
      <Link href="/" className="back">
        ← Back to the app
      </Link>

      {/* Hero --------------------------------------------------------- */}
      <header className="how-hero">
        <p className="eyebrow">How it works</p>
        <h1 className="how-title">Don&rsquo;t ask about the pitcher. Ask about the pitch.</h1>
        <p className="how-lede">
          A hitter almost never sees enough of one pitcher to learn anything. But he
          sees the same <em>kinds</em> of pitches all season long.
        </p>
        <div className="duel">
          <div className="duel-side duel-thin">
            <span className="duel-num">{evidence.max_swings_vs_pitcher}</span>
            <span className="duel-label">
              most swings any hitter took against <strong>one pitcher</strong> all season
            </span>
          </div>
          <span className="duel-arrow" aria-hidden="true">
            →
          </span>
          <div className="duel-side duel-good">
            <span className="duel-num">{evidence.max_swings_vs_group}</span>
            <span className="duel-label">
              against <strong>one kind of pitch</strong>, from everyone who throws it
            </span>
          </div>
        </div>
      </header>

      <PitchStory
        hitter={example.hitter}
        hitterShort={example.hitter_short}
        pitcherShort={example.pitcher_short}
        handWord={handWord}
        headToHead={example.head_to_head}
        maxPerPitcher={example.max_per_pitcher}
        floor={floors.cell_pitches}
        columns={example.by_shape}
        cta={
          <Link href={`/matchup/${example.pitcher_id}`} className="how-cta">
            See every Jay against {example.pitcher_short} →
          </Link>
        }
      />

      {/* Why 50 ------------------------------------------------------- */}
      <section className="why50" id="why-50" aria-labelledby="why-50-title">
        <p className="eyebrow">Why {floors.cell_pitches}?</p>
        <h2 id="why-50-title" className="why50-title">
          It&rsquo;s a judgment call, not a magic number
        </h2>
        <p>
          A miss rate is misses divided by swings, and with only a few swings, a single
          one moves it a lot. {floors.cell_pitches} pitches is about{" "}
          {floors.cell_pitches / 2} swings, since hitters swing at roughly half of what
          they see.
        </p>
        <p className="step-note">
          Take a hitter who misses {BASE_RATE}% of the time. If just one more of his
          swings had been a miss:
        </p>
        <ul className="swingcost" aria-label="How much one swing changes a miss rate">
          {SWING_STEPS.map((sw) => (
            <li key={sw} className={sw === floors.cell_pitches / 2 ? "is-floor" : ""}>
              <span className="swingcost-n">{sw} swings</span>
              <span className="swingcost-track" aria-hidden="true">
                <span className="swingcost-fill" style={{ width: `${(SWING_STEPS[0] / sw) * 100}%` }} />
              </span>
              <span className="swingcost-v">
                {BASE_RATE}% → {BASE_RATE + Math.round(100 / sw)}%
              </span>
            </li>
          ))}
        </ul>
        <p>
          The app colours a hitter orange or green when he misses {LEAGUE_MARGIN * 100}{" "}
          more (or fewer) times per 100 swings than the average hitter: say{" "}
          {BASE_RATE + LEAGUE_MARGIN * 100}% when the average is {BASE_RATE}%. At {Math.round(1 / LEAGUE_MARGIN)} swings or
          fewer, one swing moves him that far on its own, so a single lucky or unlucky swing
          could flip the colour. At {floors.cell_pitches / 2} swings it takes at least two.
        </p>
        <p>
          An earlier version asked for 75, and most of the grid came up blank. So the
          line moved to {floors.cell_pitches}, and every number in the app shows how many
          swings it&rsquo;s built on. A number built on 25 swings looks different from one built
          on 200, so a coach can judge it for himself.
        </p>
      </section>

      {/* Under the hood -------------------------------------------------- */}
      <section className="hood" aria-labelledby="hood-title">
        <h2 id="hood-title">Under the hood</h2>
        <ol className="pipeline">
          <li>
            <strong>Statcast</strong>
            MLB&rsquo;s pitch-tracking data: all {n(totals.pitches)} pitches from{" "}
            {facts.season}
          </li>
          <li>
            <strong>Python</strong>
            sorts every pitch into its group and adds up each hitter&rsquo;s numbers, then
            checks them against a second, separately written version
          </li>
          <li>
            <strong>Postgres</strong>
            a database that stores the finished numbers, so pages load fast
          </li>
          <li>
            <strong>Next.js</strong>
            the website itself, designed for a phone in the clubhouse first
          </li>
        </ol>
        <p className="step-note">
          Every decision, from the {floors.cell_pitches}-pitch minimum to leaving out pitch
          speed, is written down along with the numbers behind it.
        </p>
      </section>

      {/* Details --------------------------------------------------------- */}
      <section className="more">
        <h2>Details</h2>

        <details className="more-item">
          <summary>Why it matters which hand threw the pitch</summary>
          <p>
            A sweeper breaks away from the arm that threw it. So against a left-handed
            hitter, a lefty&rsquo;s sweeper runs away from him and a righty&rsquo;s runs in
            toward him.
          </p>
          <p>
            Hitters feel it: left-handed hitters miss{" "}
            <strong>{pct(hand.vs_left_hitters.lefty)}</strong> of lefty sweepers but only{" "}
            <strong>{pct(hand.vs_left_hitters.righty)}</strong> of righty ones, and
            right-handed hitters show the mirror image ({pct(hand.vs_right_hitters.righty)}{" "}
            against {pct(hand.vs_right_hitters.lefty)}). Same name, different pitch, so
            they get separate groups.
          </p>
        </details>

        {split_test && (
          <details className="more-item">
            <summary>Why pitch speed is left out</summary>
            <p>
              An earlier version also split the pitches whose speed varies most into slow,
              medium and fast, since a 73 mph curveball and an 87 mph one feel different
              to a hitter. But that divides each hitter&rsquo;s pitches three ways, and
              the piles got too small:
            </p>
            <Compare
              rows={[
                { label: "Numbers we can show, not split", value: split_test.cells_whole, tone: "good" },
                { label: "Numbers we can show, split", value: split_test.cells_split, tone: "thin" },
              ]}
              max={Math.max(split_test.cells_whole, 1)}
            />
            <p>
              Split by speed, the most any Jays hitter saw of one slice was{" "}
              {split_test.best_split_cell} pitches, short of the {floors.cell_pitches} needed.
            </p>
            <p className="step-note">
              How much each kind of pitch varies in speed: the gap, in mph, between a
              typically slow one and a typically fast one. The old version split anything
              past the red line.
            </p>
            <ul className="iqr">
              {groups.map((g) => {
                const key = `${g.hand}-${g.pitch_type}`;
                const marked = wouldSplit.has(key);
                const thin = tooThin.some((t) => `${t.hand}-${t.pitch_type}` === key);
                return (
                  <li key={key} className={marked ? "split" : thin ? "collapsed" : ""}>
                    <span className="iqr-name">
                      {handName(g.hand)} {g.name.toLowerCase()}
                      {marked && <span className="iqr-tag">was split</span>}
                      {thin && <span className="iqr-tag iqr-tag-muted">too rare to split</span>}
                    </span>
                    <span className="iqr-track">
                      <span
                        className="iqr-fill"
                        style={{ width: `${(g.iqr / (widestIqr * 1.05)) * 100}%` }}
                      />
                      {split_test.split_above_iqr != null && (
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
            {tooThin[0] && (
              <p className="step-note">
                {handName(tooThin[0].hand)} {tooThin[0].name.toLowerCase()}s vary the most
                but were never split: {n(tooThin[0].pitches)} pitches cut three ways would
                leave each slice under the {n(split_test.min_band_pitches)} a group needs.
              </p>
            )}
          </details>
        )}

        <details className="more-item">
          <summary>All {totals.shapes} pitch groups</summary>
          <p>
            Together they cover {n(totals.assigned)} of the {n(totals.typed)} pitches thrown
            this season. A kind of pitch needs {n(floors.group_pitches)} thrown across MLB
            to get its own group. The biggest one that falls short is the{" "}
            {handName(rarest.hand).toLowerCase()} {rarest.name.toLowerCase()} (
            {n(rarest.pitches)} thrown by {rarest.pitchers} pitchers). When a starter throws
            one of those, his page says so instead of hiding it.
          </p>
          <ul className="shapebars">
            {shapes.map((s) => (
              <li key={s.shape_id}>
                <span className="shapebars-name">{plainLabel(s.label)}</span>
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
        </details>

        <details className="more-item">
          <summary>What this is not</summary>
          <p>
            Grouping pitches by kind is a standard idea, not a new one: well-known public
            pitch ratings are built the same way, and MLB&rsquo;s own tracking system
            decides what counts as a slider or a sweeper. What&rsquo;s mine is splitting
            by the pitcher&rsquo;s hand, the minimums ({n(floors.group_pitches)} pitches
            across MLB for a group, {floors.cell_pitches} for a hitter&rsquo;s number),
            comparing every hitter to the average, and stopping here after measuring that
            finer groups don&rsquo;t help.
          </p>
          <p className="step-note">
            Numbers on this page come from MLB&rsquo;s {facts.season} pitch-tracking data,
            measured on{" "}
            {new Date(`${evidence.generated}T12:00:00Z`).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
            .
          </p>
        </details>
      </section>
    </main>
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
