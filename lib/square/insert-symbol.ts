/**
 * Inserting a `$SYMBOL` into the composer at the caret.
 *
 * Fiddlier than it looks, and worth pinning: the tag has to end up separated
 * from the words around it, or `watching$BTC` reaches the feed and the
 * cashtag parser — which requires a non-word character before the `$` —
 * correctly refuses to make it a chip. The author would have used the tool and
 * got nothing for it.
 *
 * Pure and dependency-free so it can be tested without a renderer.
 */
export interface Insertion {
  text: string;
  /** Where the caret should sit afterwards. */
  caret: number;
}

export function insertSymbol(text: string, symbol: string, caret: number): Insertion {
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const after = text.slice(at);

  // Only add a space when there is something to separate from.
  const needsLeadingSpace = before !== "" && !/\s$/.test(before);
  const needsTrailingSpace = after !== "" && !/^\s/.test(after);

  const tag = `${needsLeadingSpace ? " " : ""}$${symbol.toUpperCase()}`;
  const trailing = needsTrailingSpace ? " " : "";

  return {
    text: `${before}${tag}${trailing}${after}`,
    // After the tag and its trailing space — ready to keep typing.
    caret: before.length + tag.length + trailing.length,
  };
}
