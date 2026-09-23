"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { H, W, BASE_Y, layout } from "@/lib/dots";
import { shortLabel } from "@/lib/labels";
import { verdictFor } from "@/lib/matchup";

export type StoryColumn = {
  label: string;
  from_him: number;
  from_everyone: number;
  swings: number;
  whiff_rate: number | null;
  league_whiff_rate: number | null;
};

type Props = {
  hitter: string;
  hitterShort: string;
  pitcherShort: string;
  handWord: string;
  headToHead: number;
  maxPerPitcher: number;
  floor: number;
  columns: StoryColumn[];
  cta: React.ReactNode;
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * "One dot = one pitch": the whole idea as a single picture that changes as
 * the reader scrolls. The words carry the argument on their own; the picture
 * is there to make it obvious, so it is hidden from screen readers and each
 * step's text says everything the scene shows.
 *
 * The scene follows whichever step is crossing the reading line, watched with
 * an IntersectionObserver rather than a scroll handler.
 */
export default function PitchStory(props: Props) {
  const { columns, floor } = props;
  const L = useMemo(() => layout(columns, floor), [columns, floor]);
  const [scene, setScene] = useState(1);
  const steps = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setScene(Number((e.target as HTMLElement).dataset.scene));
        }
      },
      // The reading line. On a phone the top half of the screen is the
      // picture, so a step takes over when its words are low in the half
      // below it and readable; side by side on a wide screen, mid-screen.
      {
        rootMargin: window.matchMedia("(min-width: 60rem)").matches
          ? "-48% 0px -48% 0px"
          : "-70% 0px -26% 0px",
      },
    );
    steps.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const biggest = columns[0];
  const times = Math.round(biggest.from_everyone / Math.max(1, biggest.from_him));
  // In a sentence, the name a fan would say: "four-seam" alone reads oddly.
  const names = columns.map((c) => {
    const name = shortLabel(c.label).toLowerCase();
    return name === "four-seam" ? "four-seam fastball" : name;
  });
  // "sinker, sweeper, changeup and four-seam": the kinds, named.
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const pieces = columns
    .map((c, i) => `${c.from_him} ${names[i]}${c.from_him === 1 ? "" : "s"}`)
    .join(", ");

  return (
    <div className="story">
      <div className="story-figure">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`story-svg scene-${scene}`}
          aria-hidden="true"
          focusable="false"
        >
          {/* Scene 1: the box of slots the floor asks for. */}
          <g className="box" style={{ opacity: scene === 1 ? 1 : 0 }}>
            {L.slots.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={L.boxRadius} className="slot" />
            ))}
            <text x={W / 2} y={L.slots[0].y - 30} className="svg-caption" textAnchor="middle">
              {props.floor} needed to say anything
            </text>
          </g>

          {/* The dots. */}
          <g>
            {L.dots.map((d, i) => {
              const inBox = scene === 1;
              const shown = d.him ? scene <= 3 : scene === 3;
              const toCell = scene === 4;
              const x = inBox && d.boxX !== null ? d.boxX : toCell ? L.colX(d.col) + L.colW / 2 : d.x;
              const y = inBox && d.boxY !== null ? d.boxY : toCell ? H / 2 : d.y;
              const scale = inBox ? L.boxRadius / L.radius : toCell ? 0.2 : 1;
              return (
                <circle
                  key={i}
                  r={L.radius}
                  className={d.him ? "dot dot-him" : "dot dot-all"}
                  style={{
                    transform: `translate(${x}px, ${y}px) scale(${scale})`,
                    opacity: shown ? 1 : 0,
                    // Pour in from the bottom up when the column fills.
                    transitionDelay: scene === 3 && !d.him ? `${Math.min(d.row * 14, 650)}ms` : "0ms",
                  }}
                />
              );
            })}
          </g>

          {/* Scenes 2-3: the floor line, drawn over the dots so every column
              visibly crosses it. */}
          <g style={{ opacity: scene === 2 || scene === 3 ? 1 : 0 }} className="fade">
            <line x1={4} x2={W - 4} y1={L.floorY} y2={L.floorY} className="floor-line" />
            <text x={6} y={L.floorY - 5} className="svg-floor svg-halo">
              {floor} needed
            </text>
          </g>

          {/* Counts above, names below each column. */}
          <g style={{ opacity: scene === 2 || scene === 3 ? 1 : 0 }} className="fade">
            {columns.map((c, i) => {
              const cx = L.colX(i) + L.colW / 2;
              const n = scene === 3 ? c.from_everyone : c.from_him;
              // Right on top of its own pile, so a short pile reads as short.
              const top = BASE_Y - Math.ceil(n / L.perRow) * L.pitch - 7;
              return (
                <g key={c.label}>
                  <text x={cx} y={top} className="svg-count" textAnchor="middle">
                    {n.toLocaleString()}
                  </text>
                  <text x={cx} y={BASE_Y + 20} className="svg-name" textAnchor="middle">
                    {shortLabel(c.label)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Scene 4: each column as the cell a coach sees. */}
          <g style={{ opacity: scene === 4 ? 1 : 0 }} className="fade">
            <text x={W / 2} y={H / 2 - 78} className="svg-caption" textAnchor="middle">
              {props.hitter} vs {props.pitcherShort}&rsquo;s pitches
            </text>
            {columns.map((c, i) => {
              const verdict = verdictFor(c.whiff_rate, c.league_whiff_rate) ?? "typical";
              const x = L.colX(i) + 4;
              const w = L.colW - 8;
              return (
                <g key={c.label} className={`svg-cell svg-cell-${verdict}`}>
                  <rect x={x} y={H / 2 - 58} width={w} height={116} rx={10} />
                  <text x={x + w / 2} y={H / 2 - 32} className="svg-cell-name" textAnchor="middle">
                    {shortLabel(c.label)}
                  </text>
                  <text x={x + w / 2} y={H / 2 + 6} className="svg-cell-rate" textAnchor="middle">
                    {pct(c.whiff_rate)}
                  </text>
                  <text x={x + w / 2} y={H / 2 + 26} className="svg-cell-sub" textAnchor="middle">
                    MLB avg {pct(c.league_whiff_rate)}
                  </text>
                  <text x={x + w / 2} y={H / 2 + 44} className="svg-cell-sub" textAnchor="middle">
                    {c.swings} swings
                  </text>
                </g>
              );
            })}
            <text x={W / 2} y={H / 2 + 84} className="svg-floor" textAnchor="middle">
              how often he swings and misses, next to the MLB average
            </text>
          </g>
        </svg>
        <p className="story-legend" aria-hidden="true" style={{ opacity: scene === 4 ? 0 : 1 }}>
          <span>
            <i className="lg-him" /> from {props.pitcherShort}
          </span>
          <span className={scene >= 3 ? "" : "is-off"}>
            <i className="lg-all" /> from other {props.handWord}s
          </span>
        </p>
      </div>

      <div className="story-steps">
        <Step i={1} refs={steps} active={scene === 1}>
          <p className="story-kicker">One dot = one pitch</p>
          <h3>
            {props.hitterShort} has seen <em className="t-him">{props.headToHead} pitches</em>{" "}
            from {props.pitcherShort}. All season.
          </h3>
          <p>
            We want at least {floor} before trusting a number (
            <a href="#why-50">why {floor}?</a>), and {props.headToHead} is nowhere close.
            That&rsquo;s normal: the most he&rsquo;s seen from any one pitcher all season is{" "}
            {props.maxPerPitcher}.
          </p>
        </Step>
        <Step i={2} refs={steps} active={scene === 2}>
          <h3>Sort them by the kind of pitch.</h3>
          <p>
            {pieces}. Split up like this, every pile is even further from {floor}.
          </p>
        </Step>
        <Step i={3} refs={steps} active={scene === 3}>
          <h3>
            Now add the same kinds of pitches from{" "}
            <em className="t-all">every other {props.handWord}</em>.
          </h3>
          <p>
            Every {list} {props.hitterShort} has faced from any {props.handWord} counts. He
            has seen <strong>{biggest.from_everyone.toLocaleString()}</strong> {names[0]}s
            this season, not {biggest.from_him}: {times} times as many pitches to go on.
            Every pile now passes {floor}.
          </p>
        </Step>
        <Step i={4} refs={steps} active={scene === 4}>
          <h3>Each pile becomes one number.</h3>
          <p>
            How often he swings and misses at each kind of pitch, next to the average MLB
            hitter. Green means he misses less than average; orange, more. Do that for every
            pitch a starter throws and every Jays hitter, and that&rsquo;s the app.
          </p>
          {props.cta}
        </Step>
      </div>
      {/* The same story for a screen reader, in one place. */}
      <p className="sr-only">
        Pitch counts: {columns.map((c, i) => `${names[i]}: ${c.from_him} from ${props.pitcherShort}, ${c.from_everyone} in all`).join("; ")}.
        {" "}Miss rates: {columns.map((c, i) => `${names[i]} ${pct(c.whiff_rate)} against a league ${pct(c.league_whiff_rate)}`).join("; ")}.
      </p>
    </div>
  );
}

function Step({
  i,
  refs,
  active,
  children,
}: {
  i: number;
  refs: React.RefObject<(HTMLElement | null)[]>;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`story-step${active ? " is-active" : ""}`}>
      {/* Watched instead of the section: what matters is where the words
          are, not where the section's padding starts. */}
      <div
        ref={(el) => {
          refs.current[i - 1] = el;
        }}
        data-scene={i}
      >
        {children}
      </div>
    </section>
  );
}
