"use client";

import { useCallback, useRef, useState } from "react";
import { fetchDepositStatus } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSolanaToBase } from "@/hooks/use-solana-to-base";
import { depositProgress } from "@/lib/deposit";
import { fetchLifiStatus } from "@/lib/trade/lifi";
import { SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";

export type ProceedsPhase = "idle" | "quoting" | "signing" | "settling" | "done" | "failed";

const SLIPPAGE_BPS = 50;
const POLL_MS = 3_000;
const SETTLE_DEADLINE_MS = 150_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Brings Solana USDC back to Base after an RWA sale. This deliberately reuses
// the same Dextopus-first, LI.FI-fallback executor as every other Solana sell,
// so the app cannot promise Base USDC in one surface while routing to SOL in
// another.
export function useSolanaProceeds() {
  const settleSolana = useSolanaToBase();
  const portfolio = usePortfolio();
  const [phase, setPhase] = useState<ProceedsPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // A request id means the source transfer has already been submitted. Never
  // submit a second sweep merely because settlement polling timed out.
  const sentRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    sentRef.current = false;
  }, []);

  const bringHome = useCallback(
    async (rawUsdc: string): Promise<boolean> => {
      const requested = BigInt(rawUsdc || "0");
      if (requested <= 0n) {
        setError("No Solana USDC is available to move.");
        setPhase("failed");
        return false;
      }
      if (sentRef.current) return false;

      setError(null);
      setPhase("quoting");
      try {
        const execute = (amount: bigint) =>
          settleSolana({
            asset: USDC_BY_CHAIN.solana.address,
            decimals: USDC_BY_CHAIN.solana.decimals,
            amount,
            slippageBps: SLIPPAGE_BPS,
            maxRequested: true,
          });

        let result;
        try {
          result = await execute(requested);
        } catch (cause) {
          // This is an automatic "bring all proceeds home" sweep, so a newer
          // confirmed balance is the intended amount rather than an altered
          // discretionary order. The interactive sell UIs still require a
          // second confirmation for the same condition.
          if (!(cause instanceof SolanaBalanceChangedError) || cause.availableAmount <= 0n) {
            throw cause;
          }
          result = await execute(cause.availableAmount);
        }

        sentRef.current = true;
        setPhase("settling");
        const deadline = Date.now() + SETTLE_DEADLINE_MS;
        while (Date.now() < deadline) {
          await delay(POLL_MS);
          if (result.rail === "lifi") {
            const status = await fetchLifiStatus(result.requestId).catch(() => "PENDING" as const);
            if (status === "DONE") {
              void portfolio.refetchUntilChanged();
              setPhase("done");
              return true;
            }
            if (status === "FAILED") throw new Error("The transfer did not complete.");
            continue;
          }

          const status = await fetchDepositStatus(result.requestId).catch(() => null);
          if (!status) continue;
          const progress = depositProgress(status.status, status.executionStatus);
          if (progress.stage === "settled") {
            void portfolio.refetchUntilChanged();
            setPhase("done");
            return true;
          }
          if (progress.stage === "failed" || progress.stage === "refunded") {
            throw new Error("The transfer did not complete.");
          }
        }
        throw new Error("The transfer is taking longer than expected.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The transfer did not complete.");
        setPhase("failed");
        return false;
      }
    },
    [settleSolana, portfolio]
  );

  return {
    bringHome,
    phase,
    error,
    reset,
    busy: phase !== "idle" && phase !== "done" && phase !== "failed",
  };
}
