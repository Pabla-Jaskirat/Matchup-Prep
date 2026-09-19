/** "RHP Splitter 85-88" -> "Splitter 85-88". The hand is already in the
 *  header; repeating it on fourteen rows of chips wastes the width a phone
 *  does not have. */
export function shortLabel(label: string): string {
  return label.replace(/^[LR]HP\s+/, "");
}
