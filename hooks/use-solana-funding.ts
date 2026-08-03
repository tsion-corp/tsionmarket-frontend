"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fetchLifiQuote, fetchLifiStatus, type LifiQuote } from "@/lib/trade/lifi";
import {
  BASE_USDC,
  LIFI_BASE_CHAIN,
  LIFI_SOLANA_CHAIN,
  fundingLegs,
  planSignature,
  resizeBridgeSend,
  type FundingLeg,
  type FundingPlan,
} from "@/lib/rwa/funding";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { getWalletAddress } from "@/lib/user";

export type FundingPhase = "idle" | "quoting" | "signing" | "settling" | "done" | "failed";
export type StepStatus = "pending" | "active" | "done" | "failed";

// One visible line of the progress list. The panel renders these directly, so a
// stalled run always says which leg it stalled on and what it was doing.
export interface FundingStep {
  kind: FundingLeg["kind"];
  status: StepStatus;
  phase: FundingPhase;
  usdc: number;
}

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
  const evmSendBatch = useEvmSendBatch();
  const portfolio = usePortfolio();
  const [phase, setPhase] = useState<FundingPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<FundingStep[]>([]);
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
    setSteps([]);
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

      // What is left on Base to spend, so a re-sized send can never ask for
      // more than the wallet holds. Decremented as each leg goes out, because
      // the portfolio will not have caught up mid-run.
      let availableBase =
        portfolio.tokens.find(
          (t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC"
        )?.balance ?? 0;

      const legs = fundingLegs(plan);
      const mark = (index: number, status: StepStatus, legPhase: FundingPhase) =>
        setSteps((prev) =>
          prev.map((s, i) => (i === index ? { ...s, status, phase: legPhase } : s))
        );

      setSteps(
        legs.map((leg) => ({
          kind: leg.kind,
          usdc: leg.usdc,
          status: sentRef.current.kinds.has(leg.kind) ? "done" : "pending",
          phase: "idle" as FundingPhase,
        }))
      );
      setError(null);

      let index = -1;
      try {
        for (const leg of legs) {
          index++;
          if (sentRef.current.kinds.has(leg.kind)) continue;

          setPhase("quoting");
          mark(index, "active", "quoting");
          const { quote, amountIn } = await sizedQuote(leg, plan, from, to, availableBase);
          const sentUsdc = Number(fromBaseUnits(amountIn, 6));
          availableBase -= sentUsdc;
          setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, usdc: sentUsdc } : s)));

          setPhase("signing");
          mark(index, "active", "signing");
          // The bridge pulls the USDC with transferFrom, so it needs an
          // allowance first or it reverts. Both calls go out as one atomic
          // sponsored operation: the allowance is granted and spent in the same
          // transaction, so it is never left standing and the user signs once.
          const hash = await evmSendBatch(
            [
              {
                to: BASE_USDC as `0x${string}`,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [quote.approvalAddress as `0x${string}`, amountIn],
                }),
              },
              {
                to: quote.transactionRequest.to as `0x${string}`,
                data: quote.transactionRequest.data as `0x${string}`,
                value: BigInt(quote.transactionRequest.value || "0"),
              },
            ],
            quote.transactionRequest.chainId
          );
          // Recorded the moment it is broadcast, not when it settles: the
          // money has left either way.
          sentRef.current.kinds.add(leg.kind);

          // The Base transaction is confirmed; the funds still have to land on
          // Solana before the buy can spend them.
          setPhase("settling");
          mark(index, "active", "settling");
          let settled = false;
          const deadline = Date.now() + SETTLE_DEADLINE_MS;
          while (!settled && Date.now() < deadline) {
            await delay(POLL_MS);
            const status = await fetchLifiStatus(hash).catch(() => "PENDING" as const);
            if (status === "DONE") settled = true;
            else if (status === "FAILED") throw new Error("The transfer did not complete.");
          }
          if (!settled) throw new Error("The transfer is still on its way. Check back shortly.");
          mark(index, "done", "done");
        }

        setPhase("done");
        return true;
      } catch (e) {
        if (index >= 0) mark(index, "failed", "failed");
        setError(e instanceof Error ? e.message : "The transfer did not complete.");
        setPhase("failed");
        return false;
      } finally {
        // Balances moved on every path that broadcast anything, so the plan
        // the panel derives from them is never left stale.
        void portfolio.refetchUntilChanged();
      }
    },
    [user, evmSendBatch, portfolio]
  );

  return {
    fund,
    phase,
    steps,
    error,
    reset,
    busy: phase !== "idle" && phase !== "done" && phase !== "failed",
  };
}

// A quote whose delivery actually covers what the leg has to land. The first
// quote is only an estimate of the bridge's cost; if it comes back short, the
// send is re-sized from what it really delivers and quoted once more. Without
// this the purchase leg lands under the price and the buy stays unaffordable —
// with too little left on Base to try again.
async function sizedQuote(
  leg: FundingLeg,
  plan: FundingPlan,
  from: string,
  to: string,
  availableBase: number
): Promise<{ quote: LifiQuote; amountIn: bigint }> {
  const ask = async (usdc: number) => {
    const amountIn = toBaseUnits(usdc.toFixed(6), 6);
    const quote = await fetchLifiQuote({
      fromChain: LIFI_BASE_CHAIN,
      toChain: LIFI_SOLANA_CHAIN,
      fromToken: BASE_USDC,
      toToken: leg.toToken,
      fromAmount: amountIn,
      fromAddress: from,
      toAddress: to,
      slippage: SLIPPAGE,
    });
    return { quote, amountIn };
  };

  const first = await ask(leg.usdc);
  // The gas leg buys SOL, so there is no USDC arrival to check against.
  if (leg.kind !== "usdc" || plan.requiredArrivalUsdc <= 0) return first;

  const delivered = Number(fromBaseUnits(first.quote.toAmountMin, 6));
  const resized = resizeBridgeSend(leg.usdc, delivered, plan.requiredArrivalUsdc, availableBase);
  return resized == null ? first : await ask(resized);
}
