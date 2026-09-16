"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { BASE_CHAIN_ID } from "@/lib/meme/chain";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { networkForChainId } from "@/lib/trade-share";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSell } from "@/features/trade/hooks/use-sell";
import { savePendingRwaSettlement } from "@/lib/trade/pending-settlement";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { maxSellable } from "@/lib/trade/gas-buffer";
import { nativeSendCost } from "@/lib/trade/native-gas";
import { SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { hasGasPolicyForNetwork } from "@/lib/trade/sponsored-evm";
import { nativeSymbol, networkLabel } from "@/lib/trade/networks";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError, supportDetail, isStaleBalanceRevert } from "@/lib/errors";
import type { SellPayload } from "@/lib/modal-types";

// 1% price tolerance, the same value the sell sheet uses.
const SLIPPAGE_BPS = 100;

interface SpotSellArgs {
  /**
   * The holding being sold, or null when the wallet holds none of this market.
   * Null leaves every field inert: there is nothing to size a fee against and
   * nothing to send.
   */
  holding: SellPayload | null;
  /** True when the amount came from the Max shortcut. */
  maxRequested: boolean;
  /** Clears the field once a sale is away. */
  onSold: () => void;
  /** Replaces the field when the chain reports a different available balance. */
  onAmountCorrected: (amount: string) => void;
}

export interface SpotSellState {
  /** True while a sale is in flight. */
  pending: boolean;
  /** Why a sale cannot be attempted at all, as a ready-to-show line, or null. */
  blockedReason: string | null;
  /** The largest amount that may be sold, as a decimal string. */
  maxAmount: string;
  /** Places the sale. Reports progress and settlement through toasts. */
  submit: (amount: string) => Promise<void>;
}

/**
 * The sell sheet's order logic, without its UI.
 *
 * The spot ticket asks for the amount itself now, on the leg the user chose and
 * in the coin being sold, so opening the sheet afterwards asked the same
 * question twice. This carries the sheet's flow across so pressing Sell sells,
 * and deliberately mirrors use-spot-buy, which exists for the same reason on the
 * other leg.
 *
 * Every safety check the sheet performs is carried across, because each of them
 * exists to stop a sale that would fail or overspend:
 *
 *   * the gas check, so a wallet that cannot pay the fee is told, not refused
 *     silently at the chain;
 *   * the measured native send cost, so selling a chain's OWN gas token holds
 *     back the real fee rather than a round number guessed in advance;
 *   * the base-unit clamp at submit, so a Max can never send more than the
 *     wallet holds, whatever the rounded figure on screen says;
 *   * the Solana balance-changed recovery and the stale-balance refetch, so a
 *     chain that has moved under us corrects the field instead of failing twice.
 */
export function useSpotSell({
  holding,
  maxRequested,
  onSold,
  onAmountCorrected,
}: SpotSellArgs): SpotSellState {
  const t = useTranslations("buySell");
  const portfolio = usePortfolio();
  const sell = useSell();
  const [busy, setBusy] = useState(false);

  const network = holding?.network ?? null;
  const nativeSym = network ? nativeSymbol(network) : null;

  // Sending the asset needs a little of the chain's native token for the fee,
  // except where the send is sponsored: EVM networks behind the bundler, and
  // Solana behind the platform gas sponsor.
  const sponsored = network
    ? hasGasPolicyForNetwork(network) || network === "solana-mainnet"
    : false;

  // A chain whose native token we cannot name is treated as having gas: we
  // cannot prove the wallet is short of a token we cannot identify, and refusing
  // the sale on that guess blocks someone who is holding plenty.
  const hasGas = useMemo(
    () =>
      sponsored ||
      nativeSym === null ||
      portfolio.tokens.some(
        (token) => token.network === network && token.symbol === nativeSym && token.balance > 0
      ),
    [sponsored, portfolio.tokens, network, nativeSym]
  );

  /**
   * Selling a chain's own gas token pays the fee out of the same balance, so the
   * most that can be sold is the balance minus that fee. Reading the live cost
   * makes the reserve the fee itself rather than a round number picked in
   * advance.
   *
   * Gated on `sellsNativeToken`, so it never runs for the ordinary case, and
   * held for 30 seconds. It is not a poll: one read, only when the asset being
   * sold IS the chain's fee token, which is the only case whose maximum depends
   * on it.
   */
  const sellsNativeToken = holding !== null && holding.address === null && !sponsored;
  const measuredGas = useQuery({
    queryKey: ["nativeSendCost", network],
    queryFn: () => nativeSendCost(network as string),
    enabled: sellsNativeToken && network !== null,
    staleTime: 30_000,
    retry: 1,
  });

  const maxSell = !holding
    ? 0
    : sellsNativeToken && measuredGas.data !== undefined
      ? Math.max(0, holding.balance - measuredGas.data)
      : maxSellable(holding.network, holding.address, holding.balance);

  // A plain decimal string: String() renders very small numbers in scientific
  // notation, which both the field's regex and the base-unit conversion reject.
  const maxAmount = useMemo(() => {
    if (!holding || maxSell <= 0) return "0";
    const fixed = maxSell.toFixed(holding.decimals);
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed;
  }, [holding, maxSell]);

  const blockedReason = !holding
    ? null
    : portfolio.loading
      ? null
      : !hasGas && nativeSym
        ? // The sheet's own wording for this case, so the two surfaces say the
          // same thing about the same problem.
          t("needGasFee", { network: networkLabel(holding.network), symbol: nativeSym })
        : null;

  // A loading toast never times out, so dismiss any orphan on unmount.
  const toastRef = useRef<string | number | undefined>(undefined);
  useEffect(
    () => () => {
      if (toastRef.current !== undefined) toast.dismiss(toastRef.current);
    },
    []
  );

  const submit = async (entered: string) => {
    if (!holding || busy) return;
    const value = Number(entered) || 0;
    if (value <= 0 || blockedReason !== null) return;

    setBusy(true);
    track("trade_previewed", {
      vertical: "spot",
      asset: holding.symbol,
      side: "sell",
      amount_usd: value * holding.priceUsd,
    });
    toastRef.current = toast.loading(t("sellingToast", { symbol: holding.symbol }));

    try {
      // Clamp to the exact on-chain balance so a Max never sends more than the
      // wallet holds: the figure on screen is a rounded float, the clamp is not.
      const units = toBaseUnits(entered, holding.decimals);
      const max = BigInt(holding.rawBalance);
      const result = await sell.mutateAsync({
        network: holding.network,
        asset: holding.address,
        decimals: holding.decimals,
        amount: units < max ? units : max,
        slippageBps: SLIPPAGE_BPS,
        maxRequested,
      });
      savePendingRwaSettlement({
        requestId: result.requestId,
        direction: "solana-to-base",
        assetSymbol: holding.symbol,
        createdAt: Date.now(),
      });
      track("trade_completed", {
        vertical: "spot",
        asset: holding.symbol,
        side: "sell",
        amount_usd: value * holding.priceUsd,
      });
      toast.success(t("takesAMoment"), { id: toastRef.current });
      toastRef.current = undefined;
      onSold();
      void portfolio.refetchUntilChanged(
        scopeOf(networkForChainId(BASE_CHAIN_ID), holding.network)
      );
    } catch (error) {
      if (error instanceof SolanaBalanceChangedError) {
        // The chain holds a different amount than the snapshot we clamped to.
        // Put the live figure in the field so the next press is reviewed rather
        // than repeating a sale that cannot settle.
        onAmountCorrected(fromBaseUnits(error.availableAmount, holding.decimals));
        void portfolio.refetch();
      } else if (isStaleBalanceRevert(error)) {
        // Refused for the balance itself, so our snapshot is behind the chain.
        void portfolio.refetch();
      }
      track("trade_failed", { vertical: "spot", asset: holding.symbol, reason: "sell_failed" });
      // The raw reason travels with the friendly line: a screenshot of this
      // toast has to be enough for someone to act on, which is what
      // supportDetail exists for.
      toast.error(
        `${friendlyError(error, t("sellFailedToast", { symbol: holding.symbol }))} ${supportDetail(error)}`.trim(),
        { id: toastRef.current }
      );
      toastRef.current = undefined;
    } finally {
      setBusy(false);
    }
  };

  return {
    pending: busy || sell.isPending,
    blockedReason,
    maxAmount,
    submit,
  };
}
