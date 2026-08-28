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
  | { kind: "text"; value: string }
  | { kind: "cashtag"; value: string; symbol: string }
  | { kind: "hashtag"; value: string; tag: string }
  | { kind: "mention"; value: string; handle: string }
  | { kind: "url"; value: string; href: string; label: string };

/**
 * `$` then 2–10 letters or digits, and NOT immediately followed by another
 * word character. Requires a non-word char (or start of string) before the `$`
 * so an email or a price like `US$50` is not mistaken for a ticker.
 */
const CASHTAG = /(^|[^\w$])\$([A-Za-z][A-Za-z0-9]{1,9})(?![\w$])/g;

/**
 * `#` then a letter then 1-49 more. Two to fifty characters total, which is
 * exactly what the service accepts — a tag linked here that the service
 * rejects is a link to a page it refuses to answer.
 *
 * Must start with a letter, or `#1` and `#2026` become discussions. The
 * leading guard keeps a URL fragment (`example.com/page#section`) and an id
 * (`issue#42`) out.
 */
const HASHTAG = /(^|[^\w#])#([A-Za-z][A-Za-z0-9_]{1,49})(?![\w#])/g;

/** `@` then a handle. */
const MENTION = /(^|[^\w@])@([A-Za-z0-9_.]{1,30})(?![\w@])/g;

/**
 * A bare URL. `https?://` only, and never `javascript:` or `data:` — this
 * becomes an anchor href, so anything looser publishes a script link wearing
 * the author's name. A scheme-less `www.example.com` stays text: prefixing a
 * scheme is how you send a reader somewhere they did not write.
 */
const URL_PATTERN = /(^|[^\w@])(https?:\/\/[^\s<>"']+)/g;

/** Host plus a hint of path, the way a link is read rather than written. */
function shortenUrl(url: URL): string {
  const host = url.host.replace(/^www\./, "");
  const tail = `${url.pathname}${url.search}`.replace(/\/$/, "");
  if (tail === "" || tail === "/") return host;
  return `${host}${tail.length > 18 ? `${tail.slice(0, 18)}\u2026` : tail}`;
}

/**
 * @param text  The post's body.
 * @param tradeable  Symbols this app can actually open a trade sheet for,
 *   compared case-insensitively.
 */
export function parseCashtags(text: string, tradeable: Iterable<string>): Segment[] {
  const known = new Set<string>();
  for (const symbol of tradeable) known.add(symbol.toUpperCase());

  const found: { start: number; end: number; segment: Segment }[] = [];

  for (const match of text.matchAll(CASHTAG)) {
    const [whole, lead = "", ticker = ""] = match;
    const symbol = ticker.toUpperCase();
    if (!known.has(symbol)) continue;
    const start = (match.index ?? 0) + lead.length;
    found.push({
      start,
      end: (match.index ?? 0) + whole.length,
      segment: { kind: "cashtag", value: `$${ticker}`, symbol },
    });
  }

  // URLs before mentions, so an `@` inside an address is part of the address.
  for (const match of text.matchAll(URL_PATTERN)) {
    const [, lead = "", raw = ""] = match;
    // Trailing punctuation ends the sentence, not the address.
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, "");
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const start = (match.index ?? 0) + lead.length;
    found.push({
      start,
      end: start + trimmed.length,
      segment: { kind: "url", value: trimmed, href: url.toString(), label: shortenUrl(url) },
    });
  }

  for (const match of text.matchAll(HASHTAG)) {
    const [whole, lead = "", tag = ""] = match;
    const start = (match.index ?? 0) + lead.length;
    found.push({
      start,
      end: (match.index ?? 0) + whole.length,
      segment: { kind: "hashtag", value: `#${tag}`, tag: tag.toLowerCase() },
    });
  }

  for (const match of text.matchAll(MENTION)) {
    const [whole, lead = "", handle = ""] = match;
    const start = (match.index ?? 0) + lead.length;
    found.push({
      start,
      end: (match.index ?? 0) + whole.length,
      segment: { kind: "mention", value: `@${handle}`, handle },
    });
  }

  // One ordered pass. Sorting is what turns four independent scans into a
  // single list without rescanning the string per kind; an overlap (a `#` or
  // `@` inside a URL) is dropped by the cursor check rather than duplicated.
  found.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const hit of found) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) segments.push({ kind: "text", value: text.slice(cursor, hit.start) });
    segments.push(hit.segment);
    cursor = hit.end;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}
