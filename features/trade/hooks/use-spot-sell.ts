"use client";

import { useAuthSession } from "@/hooks/use-auth-session";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { BASE_CHAIN_ID, chainIdOfNetwork } from "@/lib/meme/chain";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { networkForChainId } from "@/lib/trade-share";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSell } from "@/features/trade/hooks/use-sell";
import { tradeRef, useMemeTrade } from "@/features/trade/hooks/use-meme-trade";
import { swapRouteForSymbol } from "@/lib/spot-swap";
import { savePendingRwaSettlement } from "@/lib/trade/pending-settlement";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { maxSellable } from "@/lib/trade/gas-buffer";
import { canPayNativeFee, nativeSendCost } from "@/lib/trade/native-gas";
import { SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { hasGasPolicyForNetwork } from "@/lib/trade/sponsored-evm";
import { nativeSymbol, networkLabel } from "@/lib/trade/networks";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { TRADE_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";
import { pricedTradeAmounts } from "@/lib/analytics/trade-amounts";
import { swapTradeFacts } from "@/features/trade/lib/trade-analytics";
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
  const memeTrade = useMemeTrade();
  const [busy, setBusy] = useState(false);

  // A market Dextopus does not carry is bought through the Base swap engine
  // (see use-spot-buy), so the sale has to leave by the same door. Matched on
  // the holding itself, not just the symbol: the same ticker on another chain
  // is a different asset and still sells through Dextopus.
  const swapRoute = useMemo(() => {
    const route = holding ? swapRouteForSymbol(holding.symbol) : null;
    if (!route || !holding?.address) return null;
    return route.tokenAddress.toLowerCase() === holding.address.toLowerCase() &&
      route.chainId === chainIdOfNetwork(holding.network)
      ? route
      : null;
  }, [holding]);

  const session = useAuthSession();
  const feePayer = session.evmAddress ?? undefined;
  const network = holding?.network ?? null;
  const nativeSym = network ? nativeSymbol(network) : null;

  // Sending the asset needs a little of the chain's native token for the fee,
  // except where the send is sponsored: EVM networks behind the bundler, and
  // Solana behind the platform gas sponsor.
  const sponsored = network
    ? hasGasPolicyForNetwork(network) || network === "solana-mainnet"
    : false;

  const nativeBalance = useMemo(
    () =>
      portfolio.tokens.find(
        (token) => token.network === network && token.symbol === nativeSym && token.address === null
      )?.balance ?? 0,
    [portfolio.tokens, network, nativeSym]
  );

  // Selling a chain's own gas token pays the fee out of the same balance, so
  // the most that can be sold is the balance minus that fee.
  const sellsNativeToken = holding !== null && holding.address === null && !sponsored;
  // Measured wherever the sender pays, not only when selling the gas token, so
  // the same figure answers "can this wallet afford to send at all". Gas moves
  // with traffic, so it is re-read rather than frozen at the first reading.
  const measuredGas = useQuery({
    queryKey: ["nativeSendCost", network, holding?.address ?? null],
    queryFn: () =>
      nativeSendCost(network as string, {
        tokenAddress: holding?.address ?? null,
        from: feePayer,
      }),
    enabled: !sponsored && network !== null && nativeSym !== null,
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: 1,
  });

  // A chain whose native token we cannot name is treated as having gas: we
  // cannot prove the wallet is short of a token we cannot identify, and refusing
  // the sale on that guess blocks someone who is holding plenty.
  const hasGas =
    sponsored || nativeSym === null || canPayNativeFee(nativeBalance, measuredGas.data);

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
    // What the sale is worth at the price on screen. The swap engine replaces
    // it with what the receipt proves; Dextopus reports no proceeds when it
    // accepts the order, so there it stays the figure reported.
    const priced = pricedTradeAmounts(
      toBaseUnits(entered, holding.decimals),
      holding.decimals,
      holding.priceUsd
    );
    track("trade_previewed", {
      vertical: "spot",
      asset: holding.symbol,
      side: "sell",
      amount_usd: priced.amount_usd,
      token_quantity: priced.token_quantity,
    });
    toastRef.current = toast.loading(t("sellingToast", { symbol: holding.symbol }));

    if (swapRoute) {
      try {
        const result = await memeTrade.trade({
          chainId: swapRoute.chainId,
          side: "SELL",
          tokenAddress: swapRoute.tokenAddress,
          amount: entered,
          slippageBps: SLIPPAGE_BPS,
          onSubmitted: (swapId) =>
            track("trade_submitted", {
              vertical: "spot",
              asset: holding.symbol,
              side: "sell",
              amount_usd: priced.amount_usd,
              token_quantity: priced.token_quantity,
              order_id: swapId,
            }),
        });
        // Only the service's CONFIRMED is "sold". Delivered-but-unrecorded and
        // pending say so, with the reference support will ask for.
        const ref = tradeRef(result.swapId, result.requestId);
        toast.success(
          result.outcome === "delivered"
            ? t("deliveredToast", { name: holding.symbol, ref })
            : result.outcome === "pending"
              ? t("pendingToast", { name: holding.symbol, ref })
              : t("soldToast", { symbol: holding.symbol }),
          { id: toastRef.current }
        );
        toastRef.current = undefined;
        const facts = swapTradeFacts(result, priced);
        if (facts) {
          track("trade_completed", {
            vertical: "spot",
            asset: holding.symbol,
            side: "sell",
            ...facts,
          });
        }
        onSold();
        void portfolio.refetchUntilChanged(scopeOf(networkForChainId(BASE_CHAIN_ID)));
      } catch (error) {
        track("trade_failed", {
          vertical: "spot",
          asset: holding.symbol,
          side: "sell",
          ...reasonFor(TRADE_FAILURE, error),
          amount_usd: priced.amount_usd,
        });
        toast.error(
          `${friendlyError(error, t("sellFailedToast", { symbol: holding.symbol }))} ${supportDetail(error)}`.trim(),
          { id: toastRef.current }
        );
        toastRef.current = undefined;
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      // Clamp to the exact on-chain balance so a Max never sends more than the
      // wallet holds: the figure on screen is a rounded float, the clamp is not.
      const units = toBaseUnits(entered, holding.decimals);
      const max = BigInt(holding.rawBalance);
      const sold = units < max ? units : max;
      const result = await sell.mutateAsync({
        network: holding.network,
        asset: holding.address,
        decimals: holding.decimals,
        amount: sold,
        slippageBps: SLIPPAGE_BPS,
        maxRequested,
      });
      // Accepted, not yet settled: Dextopus reports the sale's proceeds later.
      const soldValue = pricedTradeAmounts(sold, holding.decimals, holding.priceUsd);
      track("trade_submitted", {
        vertical: "spot",
        asset: holding.symbol,
        side: "sell",
        amount_usd: soldValue.amount_usd,
        token_quantity: soldValue.token_quantity,
        order_id: result.requestId,
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
        ...soldValue,
        order_id: result.requestId,
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
      track("trade_failed", {
        vertical: "spot",
        asset: holding.symbol,
        side: "sell",
        ...reasonFor(TRADE_FAILURE, error),
        amount_usd: priced.amount_usd,
      });
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
    pending:
      busy ||
      sell.isPending ||
      (swapRoute !== null && memeTrade.phase !== "idle" && memeTrade.phase !== "failed"),
    blockedReason,
    maxAmount,
    submit,
  };
}
