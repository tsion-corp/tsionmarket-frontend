// Deciding when a market creator's seed liquidity should come back to them.
//
// The creator seeds the pool at creation and holds LP shares for it. There is no
// manual withdrawal in the UI any more, so once a market resolves the app
// returns that liquidity itself. This module is the pure half of that: which
// markets qualify and which side pays out. No framework imports, so every branch
// is unit tested.

import type { LpPosition, Market, Outcome, Side } from "@/features/prediction/lib/types";

// The side that redeems 1:1 after resolution. Null when the market has no
// definite winner, which is every state except a Yes/No resolution.
//
// "Invalid" is deliberately excluded: an invalidated market unwinds on different
// terms, and guessing at it would move money on a rule we have not verified.
// Those stay manual rather than automatic-and-wrong.
export function winningSide(status: Market["status"], outcome: Outcome): Side | null {
  if (status !== "Resolved") return null;
  if (outcome === "Yes") return "yes";
  if (outcome === "No") return "no";
  return null;
}

// A market whose creator is owed their seed back: it resolved to a definite
// outcome and they still hold LP shares in it.
export function isReturnable(market: Market, lpShares: bigint): boolean {
  return lpShares > 0n && winningSide(market.status, market.outcome) !== null;
}

export interface ReturnableMarket {
  market: Market;
  lpShares: bigint;
  side: Side;
}

// Every market in `markets` that the wallet should be paid out of, paired with
// its LP balance and winning side. `skip` carries the ids already handled or
// attempted this session: the read model lags a confirmed transaction by a poll
// cycle, so without it a just-returned market keeps looking returnable and the
// app would fire the same withdrawal again.
export function findReturnable(
  markets: Market[],
  lpPositions: LpPosition[],
  skip: ReadonlySet<string> = new Set()
): ReturnableMarket[] {
  const lpByMarket = new Map(lpPositions.map((p) => [p.marketId.toString(), p.lpShares]));
  const out: ReturnableMarket[] = [];
  for (const market of markets) {
    const key = market.marketId.toString();
    if (skip.has(key)) continue;
    const lpShares = lpByMarket.get(key) ?? 0n;
    if (!isReturnable(market, lpShares)) continue;
    const side = winningSide(market.status, market.outcome);
    if (!side) continue;
    out.push({ market, lpShares, side });
  }
  return out;
}
