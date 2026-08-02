"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useEvmSend } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fetchLifiQuote, fetchLifiStatus } from "@/lib/trade/lifi";
import {
  BASE_USDC,
  LIFI_BASE_CHAIN,
  LIFI_SOLANA_CHAIN,
  fundingLegs,
  planSignature,
  type FundingPlan,
} from "@/lib/rwa/funding";
import { toBaseUnits } from "@/lib/trade/math";
import { getWalletAddress } from "@/lib/user";

export type FundingPhase = "idle" | "quoting" | "signing" | "settling" | "done" | "failed";

const SLIPPAGE = 0.005;
const POLL_MS = 3_000;
// Bridges quote ~1s for the gas hop and ~30s for USDC, so this is generous
// headroom. It is a wall-clock deadline rather than a poll count because a
// slow status endpoint would otherwise stretch the wait far past it.
const SETTLE_DEADLINE_MS = 150_000;

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
  // Legs already broadcast for the plan on screen. A retry after a slow settle
  // must not re-send them: the balances a fresh plan would be derived from
  // have not caught up precisely because the transfer is still in flight.
  const sentRef = useRef<{ signature: string; kinds: Set<string> }>({
    signature: "",
    kinds: new Set(),
  });

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    sentRef.current = { signature: "", kinds: new Set() };
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

      // A materially different plan starts a fresh record; the same plan
      // resumes where it stopped.
      const signature = planSignature(plan);
      if (sentRef.current.signature !== signature) {
        sentRef.current = { signature, kinds: new Set() };
      }

      setError(null);
      try {
        for (const leg of fundingLegs(plan)) {
          if (sentRef.current.kinds.has(leg.kind)) continue;

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
          // Recorded the moment it is broadcast, not when it settles: the
          // money has left either way.
          sentRef.current.kinds.add(leg.kind);

          // The Base transaction is confirmed; the funds still have to land on
          // Solana before the buy can spend them.
          setPhase("settling");
          let settled = false;
          const deadline = Date.now() + SETTLE_DEADLINE_MS;
          while (!settled && Date.now() < deadline) {
            await delay(POLL_MS);
            const status = await fetchLifiStatus(hash).catch(() => "PENDING" as const);
            if (status === "DONE") settled = true;
            else if (status === "FAILED") throw new Error("The transfer did not complete.");
          }
          if (!settled) throw new Error("The transfer is still on its way. Check back shortly.");
        }

        setPhase("done");
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "The transfer did not complete.");
        setPhase("failed");
        return false;
      } finally {
        // Balances moved on every path that broadcast anything, so the plan
        // the panel derives from them is never left stale.
        void portfolio.refetch();
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
