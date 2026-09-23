"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BASE_CHAIN_ID } from "@/lib/meme/chain";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { networkForChainId } from "@/lib/trade-share";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useDepositStatus } from "@/hooks/use-deposit";
import { useBuyDestinations } from "@/features/trade/hooks/use-buy-catalog";
import { useBuy } from "@/features/trade/hooks/use-buy";
import { tradeRef, useMemeTrade } from "@/features/trade/hooks/use-meme-trade";
import { belowMinimumBuy, isSolanaChainId, minimumBuyUsd } from "@/lib/trade/minimums";
import { routesForSymbol } from "@/lib/buy";
import { swapRouteForSymbol } from "@/lib/spot-swap";
import { TERMINAL_STAGES, depositProgress, usdcBaseUnits } from "@/lib/deposit";
import { toast } from "@/lib/toast";
import { friendlyError } from "@/lib/errors";
import { track } from "@/lib/analytics/mixpanel";
import { TRADE_FAILURE, failureReasonForStage, reasonFor } from "@/lib/analytics/failure-reason";
import { tradeAmounts, USDC_DECIMALS, type TradeAmounts } from "@/lib/analytics/trade-amounts";
import { swapTradeFacts } from "@/features/trade/lib/trade-analytics";

// 1% price tolerance, kept out of the UI — the same value the buy sheet uses.
const SLIPPAGE_BPS = 100;

interface SpotBuyArgs {
  symbol: string;
  name: string;
  /** The dollars-to-spend string from the panel's input. */
  amount: string;
}

interface SpotBuyState {
  /** Spendable USDC on Base, as a number. */
  balance: number;
  /** Whether the balance is still loading. */
  balanceLoading: boolean;
  /** Whether a buy can be submitted right now. */
  canBuy: boolean;
  /** True when the entered amount exceeds the spendable USDC balance. */
  notEnough: boolean;
  /** Why the button is disabled, as a ready-to-show label (empty when enabled). */
  disabledLabel: string;
  /** True while an order is being placed or a swap is in flight. */
  pending: boolean;
  /** Places the order. Reports progress and settlement through toasts. */
  submit: () => Promise<void>;
}

// The buy sheet's order logic, without its UI: the desktop Spot desk drives a
// buy from its own inline panel rather than by opening the sheet. It resolves
// the token's route (or its swap route), checks the balance and minimum, places
// the order, and reports settlement through toasts — the exact hooks and flow
// the sheet uses, so the execution path is unchanged.
export function useSpotBuy({ symbol, name, amount }: SpotBuyArgs): SpotBuyState {
  const t = useTranslations("buySell");
  const tErr = useTranslations("tradeErrors");
  const portfolio = usePortfolio();
  const destinations = useBuyDestinations();

  const routes = useMemo(
    () => routesForSymbol(destinations.data ?? [], symbol),
    [destinations.data, symbol]
  );
  // Inline has no network picker, so it takes the first (best) route the
  // catalog offers for this symbol; the sheet remains the way to pick another.
  const route = routes[0] ?? null;

  const swapRoute = useMemo(() => swapRouteForSymbol(symbol), [symbol]);
  const isSwapMarket = swapRoute != null;
  // Where the trade settles: USDC leaves Base, the asset lands on the
  // route's destination. A swap-market buy is entirely on Base.
  const settledNetworks = isSwapMarket
    ? scopeOf(networkForChainId(BASE_CHAIN_ID))
    : scopeOf(networkForChainId(BASE_CHAIN_ID), networkForChainId(route?.destinationChainId ?? -1));
  const memeTrade = useMemeTrade();
  const swapBusy = isSwapMarket && memeTrade.phase !== "idle" && memeTrade.phase !== "failed";

  const buy = useBuy();
  const [requestId, setRequestId] = useState<string | null>(null);
  const status = useDepositStatus(requestId, "trade");

  const balance = useMemo(
    () =>
      portfolio.tokens
        .filter((tk) => tk.symbol === "USDC" && tk.network === "base-mainnet")
        .reduce((sum, tk) => sum + tk.balance, 0),
    [portfolio.tokens]
  );

  const value = Number(amount) || 0;
  const minUsd = minimumBuyUsd(isSolanaChainId(route?.destinationChainId));
  const belowMin = belowMinimumBuy(value, isSolanaChainId(route?.destinationChainId));
  const notEnough = !portfolio.loading && value > balance;
  const canBuy =
    (Boolean(route) || isSwapMarket) &&
    value >= minUsd &&
    !portfolio.loading &&
    value <= balance &&
    !buy.isPending &&
    !swapBusy;

  const disabledLabel =
    !route && !isSwapMarket
      ? t("unavailable")
      : value <= 0
        ? t("enterAmount")
        : belowMin
          ? t("minimumUsd", { amount: minUsd })
          : notEnough
            ? t("notEnoughBalance")
            : "";

  // The loading toast opened on submit, resolved when the order settles.
  const toastRef = useRef<string | number | undefined>(undefined);
  const settledRef = useRef(false);
  // What the order in flight is spending, for the report when it settles.
  const spentRef = useRef<TradeAmounts | null>(null);

  // Settlement tracking for the Dextopus order path: place resolves early, and
  // the order settles (or fails) later, detected here — the same effect the
  // sheet runs, minus its progress UI.
  useEffect(() => {
    if (requestId == null || settledRef.current || !status.data) return;

    /**
     * Normalised through depositProgress, exactly as the buy sheet and the spot
     * panel do, rather than compared against three literal strings.
     *
     * The service's terminal vocabulary is wider than "settled": complete,
     * success, filled, done, relayed and fulfilled all mean the same thing, and
     * completion can arrive on executionStatus while status is still
     * mid-flight. Reading the raw field missed all of those, and because the
     * POLL stops on a terminal stage there was nothing left to fire again. The
     * purchase landed and the toast span forever.
     */
    const { stage } = depositProgress(status.data.status, status.data.executionStatus);
    if (!TERMINAL_STAGES.has(stage)) return;

    settledRef.current = true;
    if (stage === "settled") {
      // The USDC this order spent, fixed when it was placed: the field may
      // hold a different amount by the time the order settles.
      if (spentRef.current) {
        track("trade_completed", {
          vertical: "spot",
          asset: symbol,
          side: "buy",
          ...spentRef.current,
          order_id: requestId,
        });
      }
      toast.success(t("boughtToast", { name }), { id: toastRef.current });
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged(settledNetworks);
      return;
    }
    // Refunded or failed. The stage carries which, so the report says so.
    track("trade_failed", {
      vertical: "spot",
      asset: symbol,
      side: "buy",
      ...failureReasonForStage(TRADE_FAILURE, stage),
      amount_usd: spentRef.current?.amount_usd,
      order_id: requestId,
    });
    toast.error(t("purchaseRefundedToast"), { id: toastRef.current });
    toastRef.current = undefined;
  }, [requestId, status.data, symbol, name, portfolio, settledNetworks, t]);

  // A loading toast never times out, so dismiss any orphan on unmount.
  useEffect(
    () => () => {
      if (toastRef.current !== undefined) toast.dismiss(toastRef.current);
    },
    []
  );

  const submit = async () => {
    if (!canBuy) return;
    track("trade_previewed", { vertical: "spot", asset: symbol, side: "buy", amount_usd: value });
    settledRef.current = false;
    // A buy's input is exact USDC, so what it spends is known up front. The
    // tokens it buys are not, and are left out rather than guessed.
    const spent = tradeAmounts({
      usdRaw: usdcBaseUnits(amount),
      usdDecimals: USDC_DECIMALS,
      tokenRaw: null,
      tokenDecimals: null,
      source: "fill",
    });
    spentRef.current = spent;
    toastRef.current = toast.loading(t("buyingToast", { name }));

    // A swap-market token settles through the meme swap engine, which resolves
    // its promise only once the whole flow (including confirmation) is done.
    if (swapRoute) {
      try {
        const result = await memeTrade.trade({
          chainId: BASE_CHAIN_ID,
          side: "BUY",
          tokenAddress: swapRoute.tokenAddress,
          amount,
          slippageBps: SLIPPAGE_BPS,
          onSubmitted: (swapId) =>
            track("trade_submitted", {
              vertical: "spot",
              asset: symbol,
              side: "buy",
              amount_usd: spent.amount_usd,
              order_id: swapId,
            }),
        });
        const facts = swapTradeFacts(result, spent);
        if (facts) {
          track("trade_completed", { vertical: "spot", asset: symbol, side: "buy", ...facts });
        }
        // Only the service's CONFIRMED is "bought". Delivered-but-unrecorded
        // and pending say so, with the reference support will ask for.
        if (result.outcome === "delivered" || result.outcome === "pending") {
          const ref = tradeRef(result.swapId, result.requestId);
          toast.success(
            result.outcome === "delivered"
              ? t("deliveredToast", { name, ref })
              : t("pendingToast", { name, ref }),
            { id: toastRef.current }
          );
          toastRef.current = undefined;
          void portfolio.refetchUntilChanged(settledNetworks);
          return;
        }
        toast.success(t("boughtToast", { name }), { id: toastRef.current });
        toastRef.current = undefined;
        void portfolio.refetchUntilChanged(settledNetworks);
      } catch (e) {
        track("trade_failed", {
          vertical: "spot",
          asset: symbol,
          side: "buy",
          ...reasonFor(TRADE_FAILURE, e),
          amount_usd: spent.amount_usd,
        });
        toast.error(friendlyError(e, t("buyFailedToast", { name }), tErr), {
          id: toastRef.current,
        });
        toastRef.current = undefined;
      }
      return;
    }

    if (!route) {
      // Nothing was placed, so the toast must not be left spinning. canBuy
      // already blocks this, which is why it reads as unavailable rather than
      // as a failure.
      toast.error(t("unavailable"), { id: toastRef.current });
      toastRef.current = undefined;
      return;
    }
    try {
      const result = await buy.mutateAsync({
        route,
        amount: usdcBaseUnits(amount),
        slippageBps: SLIPPAGE_BPS,
      });
      // The order is placed; settlement (success or refund) is reported by the
      // effect above once the deposit status lands.
      track("trade_submitted", {
        vertical: "spot",
        asset: symbol,
        side: "buy",
        amount_usd: spent.amount_usd,
        order_id: result.requestId,
      });
      setRequestId(result.requestId);
    } catch (e) {
      toast.error(friendlyError(e, t("buyFailedToast", { name })), { id: toastRef.current });
      toastRef.current = undefined;
    }
  };

  return {
    balance,
    balanceLoading: portfolio.loading,
    canBuy,
    notEnough,
    disabledLabel,
    pending: buy.isPending || swapBusy,
    submit,
  };
}
