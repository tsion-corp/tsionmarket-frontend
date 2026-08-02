"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useEvmSend } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fetchLifiQuote, fetchLifiStatus } from "@/lib/trade/lifi";
import {
  BASE_USDC,
  LIFI_BASE_CHAIN,
  LIFI_SOLANA_CHAIN,
  fundingLegs,
  type FundingPlan,
} from "@/lib/rwa/funding";
import { toBaseUnits } from "@/lib/trade/math";
import { getWalletAddress } from "@/lib/user";

export type FundingPhase = "idle" | "quoting" | "signing" | "settling" | "done" | "failed";

const SLIPPAGE = 0.005;
const POLL_MS = 3_000;
// Bridges quote ~1s for the gas hop and ~30s for USDC; give both room without
// hanging the UI forever.
const MAX_POLLS = 40;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Moves Base USDC to the user's Solana wallet so a Solana RWA buy can run:
// a fast native-SOL hop for the network fee, then the purchase funds. Every
// leg's transaction is on Base, so the user's sponsored send pays no gas.
export function useSolanaFunding() {
  const { user } = usePrivy();
  const evmSend = useEvmSend();
  const portfolio = usePortfolio();
  const [phase, setPhase] = useState<FundingPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  const fund = useCallback(
    async (plan: FundingPlan): Promise<boolean> => {
      const from = getWalletAddress(user, "ethereum");
      const to = getWalletAddress(user, "solana");
      if (!from || !to) {
        setError("No wallet");
        setPhase("failed");
        return false;
      }

      setError(null);
      try {
        for (const leg of fundingLegs(plan)) {
          setPhase("quoting");
          const quote = await fetchLifiQuote({
            fromChain: LIFI_BASE_CHAIN,
            toChain: LIFI_SOLANA_CHAIN,
            fromToken: BASE_USDC,
            toToken: leg.toToken,
            fromAmount: toBaseUnits(leg.usdc.toString(), 6),
            fromAddress: from,
            toAddress: to,
            slippage: SLIPPAGE,
          });

          setPhase("signing");
          const hash = await evmSend({
            to: quote.transactionRequest.to as `0x${string}`,
            data: quote.transactionRequest.data as `0x${string}`,
            value: BigInt(quote.transactionRequest.value || "0"),
            chainId: quote.transactionRequest.chainId,
          });

          // The Base transaction is confirmed; the funds still have to land on
          // Solana before the buy can spend them.
          setPhase("settling");
          let settled = false;
          for (let i = 0; i < MAX_POLLS && !settled; i += 1) {
            await delay(POLL_MS);
            const status = await fetchLifiStatus(hash).catch(() => "PENDING" as const);
            if (status === "DONE") settled = true;
            else if (status === "FAILED") throw new Error("The transfer did not complete.");
          }
          if (!settled) throw new Error("The transfer is taking longer than expected.");
        }

        void portfolio.refetch();
        setPhase("done");
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "The transfer did not complete.");
        setPhase("failed");
        return false;
      }
    },
    [user, evmSend, portfolio]
  );

  return {
    fund,
    phase,
    error,
    reset,
    busy: phase !== "idle" && phase !== "done" && phase !== "failed",
  };
}
