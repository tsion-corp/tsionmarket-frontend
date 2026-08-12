"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { usePortfolio } from "@/hooks/use-portfolio";
import { confirmSolanaSignature } from "@/lib/trade/solana-confirm";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { fetchLifiStatus, fetchSolanaBridgeQuote } from "@/lib/trade/lifi";
import { LIFI_BASE_CHAIN, BASE_USDC } from "@/lib/trade/funding";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";
import { getWalletAddress } from "@/lib/user";

export type ProceedsPhase = "idle" | "quoting" | "signing" | "settling" | "done" | "failed";

const SLIPPAGE = 0.005;
const POLL_MS = 3_000;
// Wall-clock, not a poll count: a slow status endpoint would otherwise stretch
// the wait far past the intended ceiling. The route itself settles in ~7s.
const SETTLE_DEADLINE_MS = 150_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Brings USDC on Solana back to Base, where the rest of the account lives —
// the return half of the funding leg, used after selling a Solana asset.
//
// Unlike the outbound legs, this route originates on Solana: LI.FI returns a
// base64 transaction for the embedded Solana wallet to sponsor, sign, and
// send. That keeps the return leg gasless too, instead of burning the user's
// leftover SOL from the funding hop.
export function useSolanaProceeds() {
  const { user } = usePrivy();
  const sendSponsored = useSponsoredSolanaSend();
  const { wallets: solanaWallets } = useWallets();
  const portfolio = usePortfolio();
  const [phase, setPhase] = useState<ProceedsPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // The signature is signed and sent before the bridge settles, so a retry
  // after a slow settle would send the balance twice — and this leg costs the
  // user real SOL each time.
  const sentRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    sentRef.current = false;
  }, []);

  // rawUsdc is the exact base-unit string from the holding; the display
  // float rounds half-up and can ask for more than the wallet holds.
  const bringHome = useCallback(
    async (rawUsdc: string): Promise<boolean> => {
      const from = getWalletAddress(user, "solana");
      const to = getWalletAddress(user, "ethereum");
      const wallet = solanaWallets[0];
      if (!from || !to || !wallet || BigInt(rawUsdc || "0") <= 0n) {
        setError("No wallet");
        setPhase("failed");
        return false;
      }

      if (sentRef.current) return false;
      setError(null);
      try {
        setPhase("quoting");
        const quote = await fetchSolanaBridgeQuote({
          fromToken: USDC_BY_CHAIN.solana.address,
          toChain: LIFI_BASE_CHAIN,
          toToken: BASE_USDC,
          fromAmount: BigInt(rawUsdc),
          fromAddress: from,
          toAddress: to,
          slippage: SLIPPAGE,
        });

        setPhase("signing");
        const sig = await sendSponsored({ transaction: quote.transaction, wallet });
        sentRef.current = true;
        await confirmSolanaSignature(sig).catch(() => {
          // The bridge poll below is the real settlement signal.
        });

        setPhase("settling");
        const deadline = Date.now() + SETTLE_DEADLINE_MS;
        while (Date.now() < deadline) {
          await delay(POLL_MS);
          const status = await fetchLifiStatus(sig).catch(() => "PENDING" as const);
          if (status === "DONE") {
            void portfolio.refetchUntilChanged();
            setPhase("done");
            return true;
          }
          if (status === "FAILED") throw new Error("The transfer did not complete.");
        }
        throw new Error("The transfer is taking longer than expected.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "The transfer did not complete.");
        setPhase("failed");
        return false;
      }
    },
    [user, solanaWallets, sendSponsored, portfolio]
  );

  return {
    bringHome,
    phase,
    error,
    reset,
    busy: phase !== "idle" && phase !== "done" && phase !== "failed",
  };
}
