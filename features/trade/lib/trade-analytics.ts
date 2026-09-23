import type { TradeAmounts } from "@/lib/analytics/trade-amounts";
import type { TradeResult } from "@/features/trade/hooks/use-meme-trade";

/**
 * The trade_completed facts for a swap-engine trade, or null when it is not a
 * completed trade yet.
 *
 * `confirmed` and `delivered` both count: a delivered swap is one the receipt
 * proves paid out while the service recorded something else, so the money
 * moved and it belongs in volume. `pending` has no verdict and is not counted.
 *
 * The amounts are the swap's own (see useMemeTrade), or `fallback` when the
 * swap could not be priced in USDC, such as a Solana quote.
 */
export function swapTradeFacts(result: TradeResult, fallback: TradeAmounts | null) {
  if (result.outcome === "pending") return null;
  const amounts = result.amounts ?? fallback;
  if (!amounts) return null;
  return {
    ...amounts,
    recorded: result.outcome,
    order_id: result.swapId ?? undefined,
    tx_hash: result.txHash ?? undefined,
  };
}
