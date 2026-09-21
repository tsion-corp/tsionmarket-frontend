// What the search boxes in the funding flows filter on.
//
// Both flows show the same two kinds of list, tokens and networks, and both
// draw the same search box above them. The withdraw flow's box was wired to
// state nothing read, so it looked like a search and did nothing.

interface Named {
  name: string;
}

interface TokenLike {
  symbol: string;
  name: string;
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

/** Tokens whose ticker or name contains the query. An empty query keeps all. */
export function filterTokens<T extends TokenLike>(tokens: readonly T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return [...tokens];
  return tokens.filter(
    (token) => token.symbol.toLowerCase().includes(q) || token.name.toLowerCase().includes(q)
  );
}

/** Networks whose name contains the query. An empty query keeps all. */
export function filterChains<T extends Named>(chains: readonly T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return [...chains];
  return chains.filter((chain) => chain.name.toLowerCase().includes(q));
}
