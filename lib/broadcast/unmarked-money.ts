// A development check that turns "someone remembered to mark this" into "the
// app tells you when they did not".
//
// The financial-data guard blurs `[data-sensitive]` elements while a broadcast
// is running. That protects exactly what has been marked, and nothing proves a
// balance added next week gets marked at all. This scans the rendered DOM for
// text that LOOKS like money or a wallet address and has no `[data-sensitive]`
// ancestor, and reports it.
//
// Deliberately crude. False positives are fine and expected: a chess rating, a
// block height and a percentage all look like numbers. The point is a short
// list a developer can glance at, not a proof. Never run in production.

/** What kind of thing the text appears to be. */
export type UnmarkedKind = "money" | "address";

export interface UnmarkedFinding {
  kind: UnmarkedKind;
  /** The offending text, trimmed and capped so a log line stays readable. */
  text: string;
  /** A CSS-ish path to the element, enough to find it in the source. */
  selector: string;
}

// A currency symbol or code next to a number, in either order. Requires the
// currency marker: a bare number is far too common to flag usefully.
const MONEY = new RegExp(
  String.raw`(?:[$€£₦]\s?\d[\d,]*(?:\.\d+)?)` +
    String.raw`|(?:\d[\d,]*(?:\.\d+)?\s?(?:USDC|USDT|USD|NGN|KASH|SOL|ETH|BTC)\b)`,
  "u"
);

// A full 0x address, or the truncated form the app renders (0xab…cd), or a
// base58 Solana address.
const ADDRESS = new RegExp(
  String.raw`(?:0x[0-9a-fA-F]{4,}(?:\s?[….]{1,3}\s?[0-9a-fA-F]{2,})?)` +
    String.raw`|(?:\b[1-9A-HJ-NP-Za-km-z]{32,44}\b)`,
  "u"
);

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "PATH"]);

/** True when this element or any ancestor is already marked. */
function isProtected(element: Element | null): boolean {
  return element?.closest("[data-sensitive]") !== null && element !== null;
}

/** Enough of a path to find the element in the source. */
export function selectorPath(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && parts.length < 4 && node !== document.documentElement) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${node.id}`);
      break;
    }
    // The first couple of classes are usually the identifying ones.
    const classes = Array.from(node.classList).slice(0, 2).filter(Boolean);
    if (classes.length) part += `.${classes.join(".")}`;
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function classify(text: string): UnmarkedKind | null {
  if (ADDRESS.test(text)) return "address";
  if (MONEY.test(text)) return "money";
  return null;
}

/**
 * Every text node that looks like money or an address and sits outside any
 * `[data-sensitive]` subtree.
 *
 * Deduplicated by selector so a list of twenty rows reports once, not twenty
 * times, which is the difference between a usable warning and noise.
 */
export function findUnmarkedSensitive(root: ParentNode, limit = 25): UnmarkedFinding[] {
  const doc = (root as Document).createTreeWalker ? (root as Document) : root.ownerDocument;
  if (!doc) return [];
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const seen = new Set<string>();
  const found: UnmarkedFinding[] = [];

  let node = walker.nextNode();
  while (node && found.length < limit) {
    const text = (node.textContent ?? "").trim();
    const parent = node.parentElement;
    if (text && parent && !SKIP_TAGS.has(parent.tagName)) {
      const kind = classify(text);
      if (kind && !isProtected(parent)) {
        const selector = selectorPath(parent);
        if (!seen.has(selector)) {
          seen.add(selector);
          found.push({ kind, text: text.slice(0, 60), selector });
        }
      }
    }
    node = walker.nextNode();
  }
  return found;
}

/** One log-ready block, or null when there is nothing to report. */
export function describeFindings(found: UnmarkedFinding[]): string | null {
  if (found.length === 0) return null;
  const lines = found.map((f) => `  [${f.kind}] "${f.text}"  ${f.selector}`);
  return (
    `[broadcast guard] ${found.length} element(s) look like money or a wallet address ` +
    "but have no [data-sensitive] ancestor, so they are NOT blurred while live. " +
    "Add data-sensitive to the element or its container, or ignore this if it is a " +
    `false positive (ratings, block numbers and percentages all trip it).\n${lines.join("\n")}`
  );
}
