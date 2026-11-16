"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useCreateQuote, useDepositStatus } from "@/hooks/use-deposit";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { SETTLE_CHAINS, EVM_NATIVE_ETH, depositProgress } from "@/lib/deposit";
import { baseGasIsEmpty, BASE_NETWORK } from "@/lib/trade/gas-reserve";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { toast } from "@/lib/toast";

// Exactly $1 of USDC (6 decimals).
const TOPUP_USDC_BASE_UNITS = "1000000";
const SLIPPAGE_BPS = 100;

/**
 * Keeps a little ETH on Base in every wallet now that Base sends are user-paid
 * (see config/alchemy-bso-evm-networks.json). Every cross-chain deposit
 * settles as USDC on Base in the user's own wallet (lib/deposit.ts), so this
 * watches that one balance: when it rises while the Base gas balance is
 * empty, it swaps $1 of that USDC into native ETH on Base — same chain in and
 * out — through the same Dextopus "trade" rail the buy flow already uses.
 * Renders nothing; at most one top-up runs at a time.
 */
export function GasTopUpHost() {
  const { authenticated, evmAddress } = useAuthSession();
  const portfolio = usePortfolio();
  const quote = useCreateQuote("trade");
  const { sendUsdc } = useSendUsdc();
  const [requestId, setRequestId] = useState<string | null>(null);
  const status = useDepositStatus(requestId, "trade");

  const usdcOnBase = portfolio.tokens.find(
    (t) =>
      t.network === BASE_NETWORK &&
      t.address?.toLowerCase() === SETTLE_CHAINS.base.usdc.toLowerCase()
  );
  const usdcRaw = BigInt(usdcOnBase?.rawBalance ?? "0");
  const prevUsdcRaw = useRef<bigint | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!authenticated || !evmAddress || portfolio.loading) return;
    const prev = prevUsdcRaw.current;
    prevUsdcRaw.current = usdcRaw;
    // The first reading is a baseline, not a rise, and must not fire a swap.
    if (prev === null) return;
    const rose = usdcRaw > prev;
    const empty = baseGasIsEmpty(portfolio.tokens);
    if (!rose || !empty || inFlight.current || usdcRaw < BigInt(TOPUP_USDC_BASE_UNITS)) return;

    inFlight.current = true;
    void (async () => {
      try {
        const result = await quote.mutateAsync({
          originChainId: SETTLE_CHAINS.base.chainId,
          destinationChainId: SETTLE_CHAINS.base.chainId,
          originAsset: SETTLE_CHAINS.base.usdc,
          destinationAsset: EVM_NATIVE_ETH,
          amount: TOPUP_USDC_BASE_UNITS,
          recipient: evmAddress,
          refundTo: evmAddress,
          slippageBps: SLIPPAGE_BPS,
        });
        await sendUsdc({
          chainType: "ethereum",
          to: result.depositAddress,
          amount: BigInt(TOPUP_USDC_BASE_UNITS),
          settle: SETTLE_CHAINS.base,
        });
        setRequestId(result.depositRequestId);
      } catch {
        // A quote or send failure here is silent by design: this is a
        // convenience top-up, not a user-initiated action, and the next
        // deposit that lands while gas is still empty tries again.
        inFlight.current = false;
      }
    })();
  }, [authenticated, evmAddress, portfolio.loading, portfolio.tokens, usdcRaw, quote, sendUsdc]);

  // A ref, not state: useDepositStatus's own refetchInterval already stops
  // polling once the stage is terminal, so there is nothing left to
  // synchronize into React state here — just guard against toasting or
  // freeing inFlight more than once for the same request.
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!status.data || !requestId || handledRef.current === requestId) return;
    const { stage } = depositProgress(status.data.status, status.data.executionStatus);
    if (stage === "settled") {
      handledRef.current = requestId;
      toast.success("Topped up your Base gas balance.");
      void portfolio.refetchFresh(scopeOf(BASE_NETWORK));
      inFlight.current = false;
    } else if (stage === "failed" || stage === "refunded") {
      handledRef.current = requestId;
      inFlight.current = false;
    }
  }, [status.data, requestId, portfolio]);

  return null;
}
