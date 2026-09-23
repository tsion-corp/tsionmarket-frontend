// The rate a Kash trade actually got, for the analytics catalog.
//
// The desk quotes the two sides, not the rate between them, so it is worked
// out here from what moved. Reported as Kash per dollar on both sides of the
// trade, so a buy and a sell are directly comparable.

/**
 * Kash per dollar for a trade of `usd` dollars against `kash` Kash.
 *
 * Both arrive as decimal strings from the desk. The rate is omitted, rather
 * than reported as a zero, when either side is missing or will not parse: a
 * zero rate is a figure someone would otherwise average into a chart.
 */
export function kashRate(usd: string, kash: string): { rate?: number } {
  const dollars = Number(usd);
  const points = Number(kash);
  if (!Number.isFinite(dollars) || !Number.isFinite(points) || dollars <= 0) return {};
  return { rate: Math.round((points / dollars) * 1e6) / 1e6 };
}
