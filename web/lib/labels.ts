/** "RHP Splitter 85-88" -> "Splitter 85-88". The hand is already in the
 *  header; repeating it on fourteen rows of chips wastes the width a phone
 *  does not have. */
export function shortLabel(label: string): string {
  return label.replace(/^[LR]HP\s+/, "");
}

/** Pitch names that are too wide for a grid column on a phone. */
const COMPACT: Record<string, string> = {
  "Four-Seam": "4-Seam",
  "Knuckle-Curve": "K-Curve",
  Curveball: "Curve",
  Changeup: "Change",
};

/**
 * A column heading for the lineup grid: the pitch, and its speed band on a
 * second line when the shape has one.
 *
 * "RHP Splitter 85-88" -> { name: "Splitter", band: "85-88" }
 * "RHP Four-Seam"      -> { name: "4-Seam",   band: null }
 */
export function columnLabel(label: string): { name: string; band: string | null } {
  const short = shortLabel(label);
  const m = short.match(/^(.*?)\s+((?:under\s+)?\d+(?:-\d+|\+)?)$/);
  const name = m ? m[1] : short;
  return { name: COMPACT[name] ?? name, band: m ? m[2] : null };
}

const SUFFIXES = new Set(["Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV"]);

/**
 * "Vladimir Guerrero Jr." -> "Guerrero Jr.", "George Springer" -> "Springer".
 * A grid row has room for a surname, and "Jr." on its own names nobody.
 */
export function surname(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim();
  const last = parts[parts.length - 1];
  return SUFFIXES.has(last) && parts.length > 2
    ? `${parts[parts.length - 2]} ${last}`
    : last;
}
