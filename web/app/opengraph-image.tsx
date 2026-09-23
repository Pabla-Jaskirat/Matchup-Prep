import { ImageResponse } from "next/og";

import facts from "@/data/explainer.json";

/**
 * The picture a link to the app shows when it is pasted into Slack, LinkedIn
 * or a text: the idea of the How it works page in one frame. Guerrero's
 * pitches from Skenes (orange) at the foot of each column, everything like
 * them from every other right-hander (blue) stacked above, and the 50-pitch
 * line every column now clears.
 *
 * Generated at build time from explainer.json, so it shows real counts.
 */

export const alt = "Matchup Prep: which of a starter's pitches each Blue Jays hitter handles";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BLUE = "#134a8e";
const ORANGE = "#f97316";
const LIGHT = "#cfe1f8";

export default function OpengraphImage() {
  const cols = facts.example.by_shape;
  const floor = facts.floors.cell_pitches;

  // Dot grid: the same layout idea as the page, sized for this frame.
  const perRow = 10;
  const pitch = 7.2;
  const colW = perRow * pitch + 26;
  const chartW = cols.length * colW;
  const chartH = 380;
  const base = chartH - 10;

  const dots: { x: number; y: number; him: boolean }[] = [];
  cols.forEach((c, ci) => {
    for (let j = 0; j < c.from_everyone; j++) {
      dots.push({
        x: ci * colW + 13 + (j % perRow) * pitch + pitch / 2,
        y: base - Math.floor(j / perRow) * pitch - pitch / 2,
        him: j < c.from_him,
      });
    }
  });
  const floorY = base - (floor / perRow) * pitch;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BLUE,
          color: "white",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 560, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "white",
                color: BLUE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              MP
            </div>
            <div style={{ fontSize: 30, fontWeight: 700 }}>Matchup Prep</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>
              {"Don\u2019t ask about the pitcher. Ask about the pitch."}
            </div>
            <div style={{ fontSize: 26, color: LIGHT, lineHeight: 1.35 }}>
              {`Which of a starter\u2019s pitches each Blue Jays hitter handles, built from ${facts.totals.pitches.toLocaleString()} pitches of ${facts.season} Statcast data.`}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 21, color: LIGHT }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: ORANGE }} />
              {`${facts.example.hitter_short}\u2019s ${facts.example.head_to_head} pitches from ${facts.example.pitcher_short}`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "white" }} />
              {"the same kinds, from every other right-hander"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "flex-end" }}>
          <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
            {dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={pitch * 0.4} fill={d.him ? ORANGE : "white"} />
            ))}
            <line
              x1={0}
              x2={chartW}
              y1={floorY}
              y2={floorY}
              stroke={LIGHT}
              strokeWidth={2}
              strokeDasharray="8 6"
            />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
