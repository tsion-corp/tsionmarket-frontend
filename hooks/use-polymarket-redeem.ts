"use client";

import { useCallback, useState } from "react";
import { usePolymarketSession } from "@/hooks/use-polymarket-session";

// Claims winnings from a resolved market, converting the winning outcome tokens
// back to pUSD. Gasless via the builder relayer.
export function usePolymarketRedeem() {
  const { ensureReady } = usePolymarketSession();
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redeem = useCallback(
    async (conditionId: string) => {
      setRedeeming(conditionId);
      setError(null);
      try {
        const client = await ensureReady();
        const handle = await client.redeemPositions({ conditionId });
        await handle.wait();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not claim your winnings");
        throw e;
      } finally {
        setRedeeming(null);
      }
    },
    [ensureReady]
  );

  return { redeem, redeeming, error };
}
