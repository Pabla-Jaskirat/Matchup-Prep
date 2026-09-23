/**
 * Where every dot sits in each scene of the "one dot = one pitch" story on
 * /how-it-works. Pure geometry, so it can be tested without a browser.
 *
 *   scene 1  his pitches from this one pitcher, in a box of FLOOR slots
 *   scene 2  the same dots, sorted into a column per kind of pitch
 *   scene 3  every pitch like them, from anyone, poured into the columns
 *   scene 4  each column collapsed into the one cell the app would show
 *
 * One scale for every column, so a column twice as tall is twice the pitches,
 * and the FLOOR line sits at the same height in all of them.
 */

export const W = 360;
export const H = 360;
const PAD_X = 10;
const TOP = 30; // room for the count above each column
const BOTTOM = 34; // room for the pitch name below it
export const BASE_Y = H - BOTTOM;

// Scene 1: a 10 x 5 box, one slot per pitch the floor asks for.
const SLOT = 27;
const SLOT_COLS = 10;

export type Column = { from_him: number; from_everyone: number };

export type Dot = {
  col: number;
  /** Seen from this pitcher (true), or from everyone else (false). */
  him: boolean;
  /** Row from the bottom of its column: the fill animates bottom-up. */
  row: number;
  x: number;
  y: number;
  /** Where it sits in the scene-1 box; his pitches only. */
  boxX: number | null;
  boxY: number | null;
};

export type Layout = {
  pitch: number;
  perRow: number;
  radius: number;
  boxRadius: number;
  colX: (col: number) => number;
  colW: number;
  floorY: number;
  slots: { x: number; y: number }[];
  dots: Dot[];
};

export function layout(columns: Column[], floor: number): Layout {
  const n = Math.max(1, columns.length);
  const colW = (W - 2 * PAD_X) / n;
  const inner = colW - 14;
  const tallest = Math.max(1, ...columns.map((c) => c.from_everyone));

  // The largest dot that still fits the tallest column in the height we have.
  let pitch = 10;
  let perRow = Math.max(1, Math.floor(inner / pitch));
  while (pitch > 2 && Math.ceil(tallest / perRow) * pitch > BASE_Y - TOP) {
    pitch -= 0.25;
    perRow = Math.max(1, Math.floor(inner / pitch));
  }

  const colX = (c: number) => PAD_X + c * colW;
  const boxW = SLOT_COLS * SLOT;
  const boxRows = Math.ceil(floor / SLOT_COLS);
  const boxX0 = (W - boxW) / 2;
  const boxY0 = (H - boxRows * SLOT) / 2;
  const slots = Array.from({ length: floor }, (_, i) => ({
    x: boxX0 + SLOT / 2 + (i % SLOT_COLS) * SLOT,
    y: boxY0 + SLOT / 2 + Math.floor(i / SLOT_COLS) * SLOT,
  }));

  const dots: Dot[] = [];
  let boxed = 0;
  columns.forEach((c, col) => {
    const left = colX(col) + (colW - perRow * pitch) / 2 + pitch / 2;
    const total = Math.max(c.from_everyone, c.from_him);
    for (let j = 0; j < total; j++) {
      const row = Math.floor(j / perRow);
      const him = j < c.from_him;
      // His own pitches go first, so they stay at the bottom as the column
      // fills above them.
      const slot = him ? slots[boxed++ % Math.max(1, floor)] : null;
      dots.push({
        col,
        him,
        row,
        x: left + (j % perRow) * pitch,
        y: BASE_Y - pitch / 2 - row * pitch,
        boxX: slot ? slot.x : null,
        boxY: slot ? slot.y : null,
      });
    }
  });

  return {
    pitch,
    perRow,
    radius: pitch * 0.4,
    boxRadius: SLOT * 0.36,
    colX,
    colW,
    floorY: BASE_Y - (floor / perRow) * pitch,
    slots,
    dots,
  };
}
