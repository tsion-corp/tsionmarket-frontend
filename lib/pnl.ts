import { isStable, type ActivityEntry } from "@/lib/activity/entries";

/**
 * Realised profit and loss per asset, computed from the activity feed.
 *
 * REALISED, not unrealised: this answers "what did I actually make on the ones
 * I sold", never "what is my position worth now". The second needs live prices
 * and a full position history; the first needs only what a sale already told
 * us, which is the part we can state without qualification.
 *
 * Average cost basis, which is what a person means by "what I paid for it"
 * when they have bought the same thing more than once. FIFO would give a
 * different, equally defensible number, and the reason to prefer average here
 * is that it does not depend on us having seen every earlier lot in order:
 * missing history skews it, it does not invert it.
 *
 * WHAT THIS CANNOT SEE, and why the card must say so:
 *   - Trades made outside Ark. A position bought elsewhere and sold here has
 *     no cost basis in this data, so its "profit" would be the entire sale.
 *     Those sales are reported separately rather than folded into a total.
 *   - Fees and gas, which are not in the transfer rows.
 *   - Asset-to-asset swaps, which realise against a price we were never told.
 *
 * Numbers are float here because they come from the activity feed as floats
 * and are only ever displayed. Nothing in this module builds a transaction.
 */
export interface AssetPnl {
  symbol: string;
  /** Units still held, from the trades this data can see. */
  quantity: number;
  /** Average cost per unit of what is still held. */
  averageCost: number;
  /** Money made or lost on units already sold. */
  realised: number;
  /** What those units cost, so a percentage can be shown honestly. */
  realisedCostBasis: number;
  /** Units sold with no cost basis in this data — see the note above. */
  unbackedQuantity: number;
}

/** Oldest first: cost basis is a running total and order decides it. */
function chronological(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((a, b) => a.timestamp - b.timestamp);
}

/** A trade only has a cost basis if the other side was money. */
function cashLeg(entry: ActivityEntry): number | null {
  if (entry.counterSymbol == null || entry.counterAmount == null) return null;
  return isStable(entry.counterSymbol) ? entry.counterAmount : null;
}

export function realisedPnl(entries: ActivityEntry[]): AssetPnl[] {
  const bySymbol = new Map<string, AssetPnl>();

  const state = (symbol: string): AssetPnl => {
    const existing = bySymbol.get(symbol);
    if (existing) return existing;
    const fresh: AssetPnl = {
      symbol,
      quantity: 0,
      averageCost: 0,
      realised: 0,
      realisedCostBasis: 0,
      unbackedQuantity: 0,
    };
    bySymbol.set(symbol, fresh);
    return fresh;
  };

  for (const entry of chronological(entries)) {
    // Stablecoins are the money, not a position: counting them as an asset
    // would report a "profit" on spending dollars.
    if (isStable(entry.symbol) || entry.amount <= 0) continue;
    const cash = cashLeg(entry);
    if (cash == null) continue;

    const asset = state(entry.symbol);

    if (entry.kind === "bought") {
      const totalCost = asset.averageCost * asset.quantity + cash;
      asset.quantity += entry.amount;
      asset.averageCost = asset.quantity > 0 ? totalCost / asset.quantity : 0;
      continue;
    }

    if (entry.kind === "sold") {
      // Only what we can account for is scored. Selling more than this data
      // shows you buying means the rest came from somewhere we cannot see, and
      // calling that pure profit would be the single most flattering lie this
      // module could tell.
      const backed = Math.min(entry.amount, asset.quantity);
      const unbacked = entry.amount - backed;
      if (backed > 0) {
        const costOfSold = asset.averageCost * backed;
        const proceeds = cash * (backed / entry.amount);
        asset.realised += proceeds - costOfSold;
        asset.realisedCostBasis += costOfSold;
        asset.quantity -= backed;
      }
      asset.unbackedQuantity += unbacked;
    }
  }

  return [...bySymbol.values()];
}

/** Assets with a result worth showing: something was actually sold. */
export function closedPositions(entries: ActivityEntry[]): AssetPnl[] {
  return realisedPnl(entries)
    .filter((asset) => asset.realisedCostBasis > 0)
    .sort((a, b) => Math.abs(b.realised) - Math.abs(a.realised));
}

/** Return as a percentage of what the sold units cost. Null when unknowable. */
export function realisedPercent(asset: AssetPnl): number | null {
  if (asset.realisedCostBasis <= 0) return null;
  return (asset.realised / asset.realisedCostBasis) * 100;
}
