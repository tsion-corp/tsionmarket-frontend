"use client";

import { useCallback, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { useSendToken } from "@/hooks/use-withdraw";
import { settleCollateral, SettleError, type SettlePhase } from "@/lib/polymarket/settle";

export type { SettlePhase } from "@/lib/polymarket/settle";

// Cashes the signed-in user's Polymarket collateral out to USDC on Base in
// their own wallet. The mechanics live in lib/polymarket/settle so the
// migration flow can run the same path from the old wallet to the new one.
export function useSettleToBase() {
  const { evmAddress } = useAuthSession();
  const sendBatch = useEvmSendBatch();
  const { ensureReady } = usePolymarketSession();
  const { sendToken } = useSendToken();
  const [phase, setPhase] = useState<SettlePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const settleToBase = useCallback(async (): Promise<void> => {
    setError(null);
    setPhase("unwrapping");
    try {
      const eoa = evmAddress;
      if (!eoa) throw new SettleError("No wallet connected.");
      const client = await ensureReady();
      await settleCollateral({
        client,
        eoa,
        recipient: eoa,
        sendBatch: (calls, chainId) => sendBatch(calls, chainId, eoa),
        sendToken,
        onPhase: setPhase,
      });
    } catch (e) {
      setError(
        e instanceof SettleError ? e.message : friendlyError(e, "Couldn't cash out. Try again.")
      );
      throw e;
    } finally {
      setPhase("idle");
    }
  }, [evmAddress, sendBatch, ensureReady, sendToken]);

  return { settleToBase, phase, error };
}

// Re-exported so the positions controller can narrow on it.
export { SettleError } from "@/lib/polymarket/settle";
