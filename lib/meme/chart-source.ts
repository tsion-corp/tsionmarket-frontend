import type { ChartSource } from "@/hooks/use-chart";
import { chainSlug } from "@/lib/meme/chain";
import type { MemeToken } from "@/lib/meme/types";

/**
 * Where a memecoin's chart comes from.
 *
 * The pool when the token has one, the listing otherwise — and the pool is not
 * a fallback, it is the primary. Measured on 2026-09-30 against 20 live Base
 * rows: 14 resolved a CoinGecko id and 6 did not, and all six of those charted
 * from their pool. A listing is the exception on this desk, not the rule.
 *
 * `pairAddress` is what makes this cheap. It comes down with every row from the
 * trade service, so the pool needs no discovery call — which is the cost that
 * made a pool source untenable the last time this repo tried one (see the note
 * in lib/server/token-history.ts).
 *
 * The coin id rides along when the caller has one, so the route can fall back
 * to the listing if the pool answers nothing.
 *
 * Pure and synchronous, like `spotChartSource`: it decides from what the caller
 * already holds and does no I/O. Null only when there is neither a pool nor an
 * id, which is the one case that genuinely has no chart.
 */
export function memeChartSource(token: MemeToken, coingeckoId: string | null): ChartSource | null {
  const chain = chainSlug(token.chainId);
  if (chain && token.pairAddress) {
    return {
      kind: "pool",
      chain,
      pool: token.pairAddress,
      // The token being charted, not just the pool. A pool has two sides and
      // this one may be either; naming it is what stops the series coming back
      // as the other asset's price, drawn as though it were this one's.
      token: token.address,
      id: coingeckoId,
    };
  }
  return coingeckoId ? { kind: "coingecko", id: coingeckoId } : null;
}
