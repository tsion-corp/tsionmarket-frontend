"use client";

import { useCallback, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import {
  CashoutError,
  isNoLiquidity,
  NO_LIQUIDITY_MESSAGE,
  sellWithApprovalRetry,
  type MarketSellInput,
  type MarketSellResult,
} from "@/lib/polymarket/exit";

export type CashoutPhase = "idle" | "selling" | "approving";
export type CashOutInput = MarketSellInput;
export type CashOutResult = MarketSellResult;
export { CashoutError } from "@/lib/polymarket/exit";

// Sells a held position back into the market before resolution, the standard
// Polymarket early cash-out. Proceeds land as pUSD in the prediction balance,
// where the existing cash-out-to-Base flow can move them home. The order
// mechanics live in lib/polymarket/exit so the migration flow can sell from
// the old wallet with the same code.
export function usePolymarketCashout() {
  const { ensureReady } = usePolymarketSession();
  const [phase, setPhase] = useState<CashoutPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const cashOut = useCallback(
    async (input: CashOutInput): Promise<CashOutResult> => {
      setError(null);
      setPhase("selling");
      try {
        const client = await ensureReady();
        return await sellWithApprovalRetry(client, input, () => setPhase("approving"));
      } catch (e) {
        // The message the user sees is deliberately plain, so log what actually
        // failed. Without this the CLOB's own reason for a rejection is only
        // visible as a bare 400 in the network panel, with no body.
        console.error("Polymarket cash-out failed", {
          tokenId: input.tokenId,
          shares: input.shares,
          error: e,
        });
        const message =
          e instanceof CashoutError
            ? e.message
            : isNoLiquidity(e)
              ? NO_LIQUIDITY_MESSAGE
              : friendlyError(e, "Couldn't cash out this position. Try again.");
        setError(message);
        // Rethrow carrying the message, with the original kept as `cause` so
        // the CLOB's own rejection is still there to inspect in the console.
        throw e instanceof CashoutError ? e : new CashoutError(message, { cause: e });
      } finally {
        setPhase("idle");
      }
    },
    [ensureReady]
  );

  return { cashOut, phase, error };
}
