// Discovery across venues: every adapter is asked what the old wallet holds,
// a few at a time, and one venue failing never hides the others. Pure so it
// is tested with fake adapters.

import { errorStatus } from "@/lib/api/envelope";
import { mapWithLimit } from "@/lib/migration/concurrency";
import type {
  DiscoverContext,
  DiscoveryFailure,
  LegacyHolding,
  VenueAdapter,
} from "@/lib/migration/types";
import type { TokenBalance } from "@/lib/server/alchemy";

export interface DiscoveryResult {
  holdings: LegacyHolding[];
  failures: DiscoveryFailure[];
}

const DISCOVERY_CONCURRENCY = 4;

export async function discoverHoldings(
  adapters: readonly VenueAdapter[],
  ctx: DiscoverContext
): Promise<DiscoveryResult> {
  const holdings: LegacyHolding[] = [];
  const failures: DiscoveryFailure[] = [];
  const perVenue = await mapWithLimit(adapters, DISCOVERY_CONCURRENCY, async (adapter) => {
    // Ledgers keyed by the old identity cannot be read before the old
    // sign-in; they show up on the re-discovery that follows it.
    if (adapter.requiresLegacySession && !ctx.hasLegacySession) return [];
    try {
      return await adapter.discover(ctx);
    } catch (error) {
      console.error(`Migration discovery failed for ${adapter.venue}`, error);
      const status = errorStatus(error);
      failures.push({
        venue: adapter.venue,
        error: error instanceof Error ? error.message : String(error),
        ...(status !== null ? { status } : {}),
      });
      return [];
    }
  });
  for (const list of perVenue) holdings.push(...list);
  return { holdings, failures };
}

// The ETH spot price the portfolio already carries, for valuing the vault's
// ETH. 0 when the portfolio holds no ETH row, which only affects display.
export function ethPriceFromPortfolio(tokens: readonly TokenBalance[] | undefined): number {
  const eth = tokens?.find((t) => t.address === null && t.symbol === "ETH" && t.priceUsd > 0);
  return eth?.priceUsd ?? 0;
}
