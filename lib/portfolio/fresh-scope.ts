// Which networks a "fresh" portfolio read must re-read from the chain.
//
// A caller that has just traded needs to see its own effect, but only on
// the network the trade touched. Re-reading every network on each fresh
// request turned one trade into a sweep of 28 chains, 23 of which the
// wallet had never held anything on (ADR-2026-09-09-portfolio-refresh-scope).
// The scope travels on the wire as `fresh=1` (everything, the legacy form)
// or `fresh=<network>,<network>`.

export type FreshScope = "all" | readonly string[];

export function parseFreshParam(
  value: string | null | undefined,
  known: readonly string[]
): FreshScope | null {
  if (!value) return null;
  if (value === "1") return "all";
  const networks = value
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => known.includes(slug));
  return networks.length > 0 ? networks : null;
}

export function freshParam(scope: FreshScope): string {
  return scope === "all" ? "1" : scope.join(",");
}

export function freshFor(scope: FreshScope | null, network: string): boolean {
  if (scope === null) return false;
  if (scope === "all") return true;
  return scope.includes(network);
}

// The networks a caller knows it touched, deduplicated, with unknowns
// dropped. A caller that ends up knowing none falls back to the full sweep
// rather than to a read that would miss its own change.
export function scopeOf(...networks: (string | null | undefined)[]): FreshScope {
  const known = [...new Set(networks.filter((n): n is string => Boolean(n)))];
  return known.length > 0 ? known : "all";
}
