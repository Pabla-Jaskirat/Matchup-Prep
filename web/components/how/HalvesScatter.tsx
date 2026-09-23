"use client";

import { useState } from "react";

type Mode = "raw" | "residual" | "pitcher";

type Props = {
  /** [raw first, raw second, residual first, residual second] per cell. */
  cells: number[][];
  rawHalf: number;
  rawFull: number;
  residualHalf: number;
  residualFull: number;
  need: number;
  maxVsPitcher: number;
};

const S = 320;
const M = { l: 42, r: 10, t: 10, b: 38 };
const PW = S - M.l - M.r;
const PH = S - M.t - M.b;

// Fixed domains, chosen to hold every measured point (raw 0 to .71,
// residual -.25 to .34) with a little air, and the same on both axes so the
// diagonal is a true 45 degrees.
const DOMAIN: Record<Exclude<Mode, "pitcher">, [number, number]> = {
  raw: [0, 0.72],
  residual: [-0.28, 0.36],
};
const TICKS: Record<Exclude<Mode, "pitcher">, { v: number; label: string }[]> = {
  raw: [0, 0.2, 0.4, 0.6].map((v) => ({ v, label: `${v * 100}%` })),
  residual: [-0.2, 0, 0.2].map((v) => ({
    v,
    label: v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v * 100)}`,
  })),
};

/**
 * The split-half test, drawn. Every dot is one hitter against one kind of
 * pitch; across is his miss rate in one random half of the season's pitches,
 * up is the other half. If the number measures the hitter, the dots hug the
 * diagonal.
 *
 * The third view is the point of the project: the same chart for hitter
 * versus pitcher is empty, because no pair has enough swings to plot.
 */
export default function HalvesScatter(p: Props) {
  const [mode, setMode] = useState<Mode>("raw");
  const dom = DOMAIN[mode === "pitcher" ? "raw" : mode];
  const ticks = TICKS[mode === "pitcher" ? "raw" : mode];
  const sx = (v: number) => M.l + ((v - dom[0]) / (dom[1] - dom[0])) * PW;
  const sy = (v: number) => M.t + PH - ((v - dom[0]) / (dom[1] - dom[0])) * PH;

  const tabs: { id: Mode; label: string }[] = [
    { id: "raw", label: "Miss rate" },
    { id: "residual", label: "Pitch-specific" },
    { id: "pitcher", label: "Vs one pitcher" },
  ];

  const readout =
    mode === "raw"
      ? { big: p.rawHalf.toFixed(2), small: `halves agree · a full season: ${p.rawFull.toFixed(2)}` }
      : mode === "residual"
        ? {
            big: p.residualHalf.toFixed(2),
            small: `halves agree · a full season: ${p.residualFull.toFixed(2)}`,
          }
        : {
            big: String(p.maxVsPitcher),
            small: `most swings any hitter took against one pitcher · ${p.need} needed`,
          };

  return (
    <div className="scatter">
      <div className="seg" role="group" aria-label="What to plot">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={mode === t.id}
            className="seg-btn"
            onClick={() => setMode(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="scatter-body">
        <svg viewBox={`0 0 ${S} ${S}`} className="scatter-svg" role="img" aria-label={caption(mode, p)}>
          {/* grid + ticks */}
          {ticks.map((t) => (
            <g key={`${mode}-${t.v}`} className="scatter-tick">
              <line x1={sx(t.v)} x2={sx(t.v)} y1={M.t} y2={M.t + PH} />
              <line x1={M.l} x2={M.l + PW} y1={sy(t.v)} y2={sy(t.v)} />
              <text x={sx(t.v)} y={M.t + PH + 14} textAnchor="middle">
                {t.label}
              </text>
              <text x={M.l - 6} y={sy(t.v) + 3} textAnchor="end">
                {t.label}
              </text>
            </g>
          ))}
          <line
            className="scatter-diag"
            x1={sx(dom[0])}
            y1={sy(dom[0])}
            x2={sx(dom[1])}
            y2={sy(dom[1])}
            style={{ opacity: mode === "pitcher" ? 0 : 1 }}
          />
          <text x={M.l + PW / 2} y={S - 6} textAnchor="middle" className="scatter-axis">
            {mode === "residual" ? "First half, points vs expected →" : "First half of the season →"}
          </text>
          <text
            x={12}
            y={M.t + PH / 2}
            textAnchor="middle"
            className="scatter-axis"
            transform={`rotate(-90 12 ${M.t + PH / 2})`}
          >
            Second half →
          </text>

          <g>
            {p.cells.map((c, i) => {
              const [x, y] = mode === "residual" ? [c[2], c[3]] : [c[0], c[1]];
              return (
                <circle
                  key={i}
                  r={1.8}
                  className="scatter-dot"
                  style={{
                    transform: `translate(${sx(x)}px, ${sy(y)}px)`,
                    opacity: mode === "pitcher" ? 0 : undefined,
                    transitionDelay: `${(i % 50) * 6}ms`,
                  }}
                />
              );
            })}
          </g>

          <g className="scatter-empty" style={{ opacity: mode === "pitcher" ? 1 : 0 }}>
            <text x={M.l + PW / 2} y={M.t + PH / 2 - 8} textAnchor="middle" className="scatter-empty-big">
              Nothing to plot
            </text>
            <text x={M.l + PW / 2} y={M.t + PH / 2 + 14} textAnchor="middle">
              no pair has {p.need} swings
            </text>
          </g>
        </svg>

        <div className="scatter-readout" aria-live="polite">
          <span className={`scatter-r${mode === "pitcher" ? " is-thin" : ""}`}>
            {mode === "pitcher" ? null : <span className="scatter-r-label">r =</span>}
            {readout.big}
          </span>
          <span className="scatter-r-sub">{readout.small}</span>
          <p>{caption(mode, p)}</p>
        </div>
      </div>
    </div>
  );
}

function caption(mode: Mode, p: Props): string {
  if (mode === "raw") {
    return (
      `Each dot is one hitter against one kind of pitch, measured twice from two ` +
      `halves of the season that share no pitches. They line up along the diagonal: ` +
      `the number measures the hitter, not luck.`
    );
  }
  if (mode === "residual") {
    return (
      `The same dots, after taking out how good each hitter is overall and how hard ` +
      `each pitch is for everyone. What's left is a hitter's trouble with one ` +
      `specific pitch. It's noisier, but it still leans the same way.`
    );
  }
  return (
    `The same test on hitter against pitcher can't even be drawn. It needs ${p.need} ` +
    `swings per pair, and no hitter took more than ${p.maxVsPitcher} against any ` +
    `one pitcher all season.`
  );
}
