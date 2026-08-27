/**
 * Splitting post text into plain runs and $CASHTAGS.
 *
 * Why this exists: Ark owns the trade screen, and Market Square does not. A
 * coin mentioned in a post is therefore worth more here than anywhere else —
 * it can be one tap from the sheet that buys it. That is the whole reason to
 * render the square's feed inside Ark rather than only linking out to it.
 *
 * The rule that keeps it honest: a cashtag is only ever marked up when the
 * symbol is ACTUALLY tradeable in this app. An unrecognised `$FOO` stays plain
 * text. A chip that looks tappable and then apologises is worse than no chip,
 * and on a trading surface it implies a listing that does not exist.
 *
 * Pure and dependency-free so it can be tested without a renderer.
 */

export type Segment =
  { kind: "text"; value: string } | { kind: "cashtag"; value: string; symbol: string };

/**
 * `$` then 2–10 letters or digits, and NOT immediately followed by another
 * word character. Requires a non-word char (or start of string) before the `$`
 * so an email or a price like `US$50` is not mistaken for a ticker.
 */
const CASHTAG = /(^|[^\w$])\$([A-Za-z][A-Za-z0-9]{1,9})(?![\w$])/g;

/**
 * @param text  The post's body.
 * @param tradeable  Symbols this app can actually open a trade sheet for,
 *   compared case-insensitively.
 */
export function parseCashtags(text: string, tradeable: Iterable<string>): Segment[] {
  const known = new Set<string>();
  for (const symbol of tradeable) known.add(symbol.toUpperCase());

  const segments: Segment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(CASHTAG)) {
    const [whole, lead = "", ticker = ""] = match;
    const symbol = ticker.toUpperCase();
    if (!known.has(symbol)) continue;

    // `match.index` points at the leading character, which belongs to the text
    // run rather than the tag.
    const start = (match.index ?? 0) + lead.length;
    if (start > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, start) });
    }
    segments.push({ kind: "cashtag", value: `$${ticker}`, symbol });
    cursor = (match.index ?? 0) + whole.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }
  return segments;
}
