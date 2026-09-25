"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePortfolio } from "@/hooks/use-portfolio";
import { TradingViewChart } from "@/components/ui/tradingview-chart";
import { HyperliquidAssetPicker } from "@/features/trade/components/hyperliquid-asset-picker";
import { ChartPanelShell, ChartPanelToggle } from "@/features/trade/components/chart-panel-shell";
import { LeverageDesktopLayout } from "@/features/trade/components/leverage-desktop-layout";
import { HyperliquidFundModal } from "@/features/trade/components/hyperliquid-fund-modal";
import { HyperliquidWithdrawModal } from "@/features/trade/components/hyperliquid-withdraw-modal";
import { HyperliquidPositionsList } from "@/features/trade/components/hyperliquid-positions-list";
import { HyperliquidOrdersList } from "@/features/trade/components/hyperliquid-orders-list";
import {
  PerpOrderTicket,
  type PerpOrderSide,
  type PerpMarginMode,
  type PerpTriggerProjectionView,
} from "@/features/trade/components/perp-order-ticket";
import { spotAmountStatus } from "@/features/trade/components/spot-amount-card";
import type { SpotOrderMode } from "@/features/trade/components/spot-order-mode-toggle";
import { useHyperliquidTrading } from "@/features/trade/hooks/use-hyperliquid-trading";
import { useHyperliquidMarketContexts } from "@/features/trade/hooks/use-hyperliquid-market-contexts";
import {
  estimateLiquidationPrice,
  tierZeroMaintenanceMarginRate,
  type LiquidationEstimate,
  type LiquidationMargin,
} from "@/features/trade/lib/liquidation";
import { tradingViewSymbolForAsset } from "@/features/trade/lib/hyperliquid-tradingview";
import {
  formatSignedPercent,
  formatUsd,
  inferBracketSide,
  openFee,
  projectTriggerPnl,
  toBaseUnits,
} from "@/lib/trade/math";
import { entryPriceFromUsdString, reportShine } from "@/lib/shine";
import { friendlyError } from "@/lib/errors";
import { track } from "@/lib/analytics/mixpanel";
import { PERP_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";
import {
  marketTypeOf,
  perpClosedProps,
  perpOpenedProps,
  perpOrderProps,
  type PerpTicket,
} from "@/features/trade/lib/perp-analytics";
import { scrubVenue } from "@/features/trade/lib/venue-scrub";
import type { GatewayApiError } from "@/lib/api/envelope";
import {
  hlPairLabel,
  isBridgeMinimumDetails,
  isInsufficientMarginDetails,
  isRestingOrder,
  type HlOrderRow,
  type HlOrderSide,
  type HlPositionView,
  type HlTriggerKind,
} from "@/features/trade/lib/hyperliquid-types";

const PERPS_FUNDING_SCOPE = ["base-mainnet", "arb-mainnet"] as const;

// Hyperliquid rejects any order below this notional outright, so it is checked
// here too: a tiny order fails fast with a clear reason instead of round
// tripping to the venue first ("Order must have minimum value of $10"). The
// number moved across from HyperliquidOrderForm unchanged, and it applies to
// the POSITION's notional, not to the collateral posted.
const MIN_ORDER_NOTIONAL_USDC = 10;

// The collateral this desk posts is always USDC, at the venue's own precision.
const COLLATERAL_SYMBOL = "USDC";
const COLLATERAL_DECIMALS = 6;

interface HyperliquidProPerpsProps {
  /** Deep-links to a specific market on mount, e.g. from /trade/:symbol. */
  initialSymbol?: string;
}

// Full control: searchable market picker, chart, limit/TP/SL entry, leverage,
// positions and orders. See apps/perp's README for the backend side and
// apps/perp/src/signing/README.md for the signing model — every write below
// is signed by the user's own embedded wallet, never this backend.
//
// The screen is laid out by LeverageDesktopLayout (leverage-desktop-layout.tsx),
// which owns the geometry of the 2.0 "Leverage trading, opened charts" frame:
// a left column holding the market list with the chart and its show/hide
// control beneath it, beside one order ticket, with positions and orders full
// width underneath. That frame is two columns, so it has no region for the
// order book and trade tape; both were dropped from this surface on the
// design's terms. HyperliquidMarketPanel, HyperliquidOrderBook and
// HyperliquidTradeTape are left in the tree, unused by this screen, rather than
// deleted.
//
// This is now the only perps interface. The simple/pro switch was removed and
// HyperliquidSimplePerps is unreachable, so everything below runs on a phone
// too: under 1080px the layout stacks its columns into one scrolling page.
export function HyperliquidProPerps({ initialSymbol = "" }: HyperliquidProPerpsProps) {
  const t = useTranslations("perps");
  const trading = useHyperliquidTrading();
  const { contexts } = useHyperliquidMarketContexts(trading.authenticated);
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  const [busy, setBusy] = useState(false);
  // The chart's open/closed state. ChartPanelShell and its toggle are both
  // controlled, and the layout takes the toggle and the panel as two separate
  // slots, so the state has to live here.
  const [chartOpen, setChartOpen] = useState(true);
  // The chart's fullscreen state. ChartPanelShell draws the control but owns no
  // overlay on purpose: it reports the state to move to and leaves the screen to
  // decide what fullscreen means. Here it means the panel lifted out of the left
  // column onto a fixed backdrop, with Escape as the way out, the same mechanism
  // HyperliquidChartPanel already uses for its own card.
  const [chartFullscreen, setChartFullscreen] = useState(false);
  // The panel's frame takes a pixel height, so filling the viewport needs a real
  // number rather than a percentage: a TradingView iframe inside a
  // percentage-height box resolves to zero. Measured only while fullscreen.
  const [chartFullscreenHeight, setChartFullscreenHeight] = useState(0);
  // The market picker the fullscreen chart header carries. It is the same
  // HyperliquidAssetPicker the left column shows, on the same `selectedSymbol`
  // state, so a market picked in fullscreen is the desk's market on the way out
  // too. These two exist only to close its menu from the outside: the picker
  // holds its own open/closed flag and exposes no callback for it, so a remount
  // is the way to close it, and the remount clears the search box as well,
  // which is what closing should do. The ref is how the Escape handler finds
  // the menu and the trigger.
  const fullscreenPickerRef = useRef<HTMLDivElement | null>(null);
  const [fullscreenPickerRun, setFullscreenPickerRun] = useState(0);
  const portfolio = usePortfolio();

  // --- order ticket state ------------------------------------------------
  // Everything the ticket shows is controlled from here, because the ticket is
  // presentational and does no arithmetic. These replace the identically named
  // state HyperliquidOrderForm used to hold internally.
  //
  // `collateralUsdc` is the ticket's quantity field. On this venue the number a
  // trader types is COLLATERAL in USDC, not a base-asset size: leverage
  // multiplies it into the position's notional, and the size Hyperliquid's API
  // wants is derived from that notional below. Reading the field as a notional
  // made a 10x trade behave exactly like a 1x one on the entered dollars, which
  // is the defect the collateral semantics exist to prevent.
  const [collateralUsdc, setCollateralUsdc] = useState("");
  const [orderMode, setOrderMode] = useState<SpotOrderMode>("market");
  const [limitPrice, setLimitPrice] = useState("");
  // Held unclamped and clamped at every use. The raw value can exceed the
  // ceiling after switching from a higher-max market, and sending that had the
  // pill reading "10x" while the request said 40.
  const [leverage, setLeverage] = useState(5);
  const [marginMode, setMarginMode] = useState<PerpMarginMode>("cross");
  const [triggersOpen, setTriggersOpen] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  // The side being signed, or null when nothing is in flight. Drives the
  // ticket's own in-flight lockout.
  const [pendingSide, setPendingSide] = useState<PerpOrderSide | null>(null);
  // The live signing step, streamed by placeOrder's onStatus. The ticket shows
  // it in place of its generic in-flight line.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  // The finished outcome, success or failure. The ticket deliberately does not
  // take one: by the time an order has resolved there is nothing left for it to
  // block, so the composer says it.
  const [orderStatus, setOrderStatus] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);

  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // Clears itself a few seconds after the action actually finishes, never while
  // one is in flight: that would wipe the live progress text mid-signature.
  useEffect(() => {
    if (!orderStatus || pendingSide !== null) return;
    const timer = setTimeout(() => setOrderStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [orderStatus, pendingSide]);

  useEffect(() => {
    if (!chartFullscreen) return;
    // 96px is the overlay's own padding plus the shell's header row and the gap
    // under it. The floor keeps the chart usable on a short window.
    const measure = () => setChartFullscreenHeight(Math.max(240, window.innerHeight - 96));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape already meant "leave fullscreen" here, and the market menu on
      // the fullscreen header now wants it too. The menu gets it first: one key
      // closing both at once would drop the user back on the desk they did not
      // ask to return to. The picker keeps its open flag private, so this reads
      // the menu off the DOM rather than holding a second copy that could
      // drift out of step with it. The search field exists only while the menu
      // is open, which makes it the honest signal.
      if (fullscreenPickerRef.current?.querySelector("input") != null) {
        setFullscreenPickerRun((run) => run + 1);
        return;
      }
      setChartFullscreen(false);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [chartFullscreen]);

  // Closing the menu remounts the picker, which leaves focus on nothing. Put it
  // back where the user opened it from, the way any menu should. The trigger is
  // the picker's first button; the rows are inside the dropdown that has just
  // gone.
  useEffect(() => {
    if (fullscreenPickerRun === 0) return;
    fullscreenPickerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [fullscreenPickerRun]);

  // A top-up or withdrawal moves the user's main (spot) balance too — refresh
  // it the moment the perps side confirms, instead of leaving it to catch up
  // on its own poll. Only the two chains the money crosses on its way to and
  // from the perps account are re-read: Base and the Arbitrum bridge hop. The perps-side settlement itself (Hyperliquid's own
  // confirmation window, then the on-chain leg back to the main wallet) is
  // real transfer time that can't be sped up; this just removes the extra,
  // avoidable lag on top of it.
  // A top-up or withdrawal moves only balances (llms.txt §10): the perps
  // balance, and the main wallet on the chains the money crosses.
  const handleWalletChanged = () => {
    trading.refreshBalances();
    void portfolio.refetchFresh(PERPS_FUNDING_SCOPE);
  };

  // Default to BTC-USDC before the user has picked anything — assets sort
  // alphabetically from the backend, so falling back to assets[0] directly
  // would land on whatever sorts first (e.g. a native ticker like "0G"),
  // not the market a new user actually expects to see first.
  const asset =
    trading.assets.find((a) => a.symbol === selectedSymbol) ??
    trading.assets.find((a) => a.symbol === "BTC") ??
    trading.assets[0] ??
    null;
  // The market on screen, reported once per market. Keyed by symbol alone:
  // the desk re-renders on every price tick, and the old desk re-sent this on
  // each data refresh, which is how a view count reached 94,707.
  const viewedMarket = useRef<string | null>(null);
  const viewedSymbol = asset?.symbol ?? null;
  const viewedCategory = asset?.category ?? null;
  useEffect(() => {
    if (!viewedSymbol || viewedMarket.current === viewedSymbol) return;
    viewedMarket.current = viewedSymbol;
    track("perp_market_viewed", {
      pair: viewedSymbol,
      market_type: marketTypeOf(viewedCategory),
      venue: "hyperliquid",
    });
  }, [viewedSymbol, viewedCategory]);
  const markPrice = asset ? Number(trading.prices[asset.symbol] ?? 0) : 0;
  const currentPosition = asset
    ? (trading.positions.find((p) => p.assetId === asset.id && p.status === "open") ?? null)
    : null;

  // --- order sizing ------------------------------------------------------
  // Moved across from HyperliquidOrderForm unchanged. This is position maths on
  // a leveraged venue, so it is the same arithmetic in the same order, not a
  // rewrite: collateral times leverage is the notional, the notional over the
  // mark price is the size, and the size is FLOORED to the asset's own
  // precision so the wire size never exceeds what the entered collateral
  // actually covers. The mark price is the divisor on a limit order too, which
  // is what the form did.
  const maxLeverage = asset?.maxLeverage ?? 20;
  const clampedLeverage = Math.max(1, Math.min(leverage, maxLeverage));
  const collateralUsdcNum = Number(collateralUsdc) || 0;
  const notionalUsdc = collateralUsdcNum * clampedLeverage;
  const szDecimals = asset?.szDecimals ?? 4;
  const sizeDecimals = Math.max(0, Math.min(8, szDecimals));
  const sizeScale = 10 ** sizeDecimals;
  const sizeBaseUnits =
    markPrice > 0 ? Math.floor((notionalUsdc / markPrice) * sizeScale) / sizeScale : 0;
  const size = sizeBaseUnits > 0 ? sizeBaseUnits.toFixed(sizeDecimals) : "";
  // Always blocks, unlike the balance check: no retry or auto top-up fixes an
  // order the venue rejects outright for being too small.
  const minNotionalMet = !(notionalUsdc > 0 && notionalUsdc < MIN_ORDER_NOTIONAL_USDC);

  // The free balance exactly as the clearinghouse reports it: the withdraw
  // modal does its arithmetic in base units.
  const withdrawableUsdc = trading.clearinghouse?.withdrawable ?? "0";
  const collateralBalance = trading.clearinghouse
    ? toBaseUnits(trading.clearinghouse.withdrawable, COLLATERAL_DECIMALS)
    : 0n;

  // The entered collateral exceeds the withdrawable HyperCore balance — the same
  // reading that raises the ticket's "may bridge" advisory. The order still
  // places (placeOrder bridges from Arbitrum), so Buy stays live; this only
  // points the eye at Top up, where funding it up front avoids the bridge hop.
  // Gated on an actionable button: no accent on a disabled or busy control.
  const emphasizeTopUp =
    Boolean(trading.walletId) &&
    !busy &&
    spotAmountStatus(collateralUsdc, collateralBalance, COLLATERAL_DECIMALS) === "above-balance";

  // The price the order is expected to fill at, as a plain decimal string for
  // the estimator and as a formatted figure for the summary.
  const entryPriceDecimal = orderMode === "limit" ? limitPrice.trim() : String(markPrice);
  const entryPriceNum = Number(entryPriceDecimal) || 0;

  // --- take profit / stop loss validation --------------------------------
  // A take profit sits above entry on a long and below it on a short; a stop
  // loss the other way round. A crossed pair is a long's bracket on a short,
  // which is the exact configuration that reached Hyperliquid unchecked in the
  // 1 Sept test and had its trigger legs rejected after the entry had already
  // filled. The backend re-validates; catching it here fails before anything is
  // signed.
  //
  // The old form checked one side because it had a side. This ticket picks the
  // direction at the click, so the check runs per side and the verdict goes
  // back through sideBlockedReasons, which is what that prop is for.
  const triggerReasonFor = (side: HlOrderSide): string | null => {
    if (!triggersOpen) return null;
    const reference = orderMode === "limit" ? Number(limitPrice) : markPrice;
    if (!(reference > 0)) return null;
    const tp = Number(takeProfitPrice) || 0;
    const sl = Number(stopLossPrice) || 0;
    const isLong = side === "buy";
    if (tp > 0 && (isLong ? tp <= reference : tp >= reference)) {
      return isLong ? t("tpMustBeAboveEntry") : t("tpMustBeBelowEntry");
    }
    if (sl > 0 && (isLong ? sl >= reference : sl <= reference)) {
      return isLong ? t("slMustBeBelowEntry") : t("slMustBeAboveEntry");
    }
    return null;
  };

  // --- take profit / stop loss projection --------------------------------
  // What the bracket stands to make or cost, so the trader sees the stakes
  // before committing. This ticket has no side control, so the intended
  // direction is inferred from where the brackets sit relative to entry: a take
  // profit above entry (or a stop loss below it) is a long, the reverse a short.
  // Only a leg on the correct side of entry reads as a gain/loss; a crossed one
  // is already flagged by triggerReasonFor and shows nothing here.
  const tpPriceNum = Number(takeProfitPrice) || 0;
  const slPriceNum = Number(stopLossPrice) || 0;
  const bracketSide: HlOrderSide | null = inferBracketSide(entryPriceNum, tpPriceNum, slPriceNum);
  const projectionBase =
    triggersOpen && bracketSide
      ? {
          side: bracketSide,
          entryPrice: entryPriceNum,
          sizeBaseUnits,
          marginUsd: collateralUsdcNum,
        }
      : null;
  const tpProjection = projectionBase
    ? projectTriggerPnl({ ...projectionBase, triggerPrice: tpPriceNum })
    : null;
  const slProjection = projectionBase
    ? projectTriggerPnl({ ...projectionBase, triggerPrice: slPriceNum })
    : null;
  const takeProfitGain = tpProjection && tpProjection.pnlUsd > 0 ? tpProjection : null;
  const stopLossRisk = slProjection && slProjection.pnlUsd < 0 ? slProjection : null;
  // Reward-to-risk as "1 : N", the ratio traders judge a setup by — only when
  // both legs are set and on the right side of entry.
  const rewardToRisk =
    takeProfitGain && stopLossRisk && stopLossRisk.pnlUsd !== 0
      ? Math.abs(takeProfitGain.pnlUsd / stopLossRisk.pnlUsd)
      : null;
  const triggerProjection: PerpTriggerProjectionView | null =
    takeProfitGain || stopLossRisk
      ? {
          takeProfit: takeProfitGain
            ? {
                amount: `+${formatUsd(takeProfitGain.pnlUsd)}`,
                roe: formatSignedPercent(takeProfitGain.roePct),
              }
            : null,
          stopLoss: stopLossRisk
            ? {
                amount: `-${formatUsd(Math.abs(stopLossRisk.pnlUsd))}`,
                roe: formatSignedPercent(stopLossRisk.roePct),
              }
            : null,
          rewardRisk: rewardToRisk ? `1 : ${rewardToRisk.toFixed(2)}` : null,
        }
      : null;

  // --- estimated liquidation, per side -----------------------------------
  // Both sides, never one unlabelled figure: a long and a short liquidate on
  // opposite sides of entry, and this ticket has no direction until the button
  // is pressed. Nothing here computes a level. estimateLiquidationPrice owns
  // the venue's formula in bigint arithmetic and declines rather than guessing;
  // liquidationPrice() in lib/trade/math is NOT it and must never be used (float
  // maths, a missing denominator, and a hardcoded maintenance rate that is wrong
  // for every Hyperliquid market, always in the unsafe direction).
  const maintenanceMarginRate = tierZeroMaintenanceMarginRate(maxLeverage);
  const liquidationMargin: LiquidationMargin =
    marginMode === "isolated"
      ? { mode: "isolated", collateralUsdc: collateralUsdc.trim() || "0" }
      : {
          mode: "cross",
          accountValueUsdc: trading.clearinghouse?.marginSummary.accountValue ?? "0",
          existingMaintenanceMarginUsdc: trading.clearinghouse?.crossMaintenanceMarginUsed ?? "0",
        };
  const liquidationFor = (side: "long" | "short"): LiquidationEstimate => {
    // A market with no usable ceiling has no tier-zero rate, and that side is
    // unavailable rather than falling back to a rate of our own.
    if (maintenanceMarginRate === null) return { status: "unavailable", reason: "missingInput" };
    return estimateLiquidationPrice({
      side,
      entryPrice: entryPriceDecimal,
      notionalUsdc: notionalUsdc > 0 ? String(notionalUsdc) : "0",
      maintenanceMarginRate,
      hasExistingPositionInAsset: currentPosition !== null,
      margin: liquidationMargin,
    });
  };

  const withBusy = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };

  // `finally`, not a trailing call after `await` — a rejected action (e.g.
  // "already filled or cancelled") still means Hyperliquid's own state moved
  // since we last fetched it. Refetching only on success left a failed
  // cancel/close/edit showing the exact same stale, still-actionable row
  // forever — nothing was actually duplicated, the UI just never learned
  // the order/position had already resolved.
  const handleClosePosition = (position: HlPositionView, siblingOrderIdsToCancel: string[]) =>
    withBusy(async () => {
      try {
        const closeOrder = await trading.actions.closePosition(
          position.id,
          siblingOrderIdsToCancel
        );
        // Reported only with the close order in hand: it is what the event
        // is keyed by, and a close must never fail on its report.
        if (closeOrder) {
          const market =
            trading.assets.find((a) => a.id === position.assetId)?.symbol ?? position.assetId;
          track("perp_trade_closed", perpClosedProps(position, market, closeOrder));
        }
      } finally {
        trading.refetchAll();
        // The immediate refetch above usually already shows the close (a
        // reduce-only IOC fills almost instantly), but Hyperliquid can lag
        // behind that by a couple of seconds — this keeps polling in the
        // background (not blocking the busy state) so a still-stale
        // position, or a sibling TP/SL still shown as resting after being
        // cancelled, self-corrects within a few seconds instead of sitting
        // there until the next unrelated refetch.
        //
        // Shine does NOT listen here. This watcher only says the position is
        // gone; the record that says what it closed at and what it returned
        // (HlClosedPositionView) is written by the venue's fill event some
        // seconds later, and HyperliquidPositionsList is already waiting for
        // exactly that row to raise its share card. The close is reported
        // from there, off the record that has the figures, so a post and the
        // share card for the same trade cannot disagree.
        void trading.waitForPositionsChange((rows) => rows.every((p) => p.id !== position.id));
        if (siblingOrderIdsToCancel.length > 0) {
          void trading.waitForOrdersChange((rows) =>
            rows
              .filter((o) => siblingOrderIdsToCancel.includes(o.id))
              .every((o) => !isRestingOrder(o))
          );
        }
      }
    });

  const handleEditTrigger = (
    position: HlPositionView,
    kind: HlTriggerKind,
    triggerPrice: string,
    existingOrderId: string | undefined
  ) =>
    withBusy(async () => {
      try {
        await trading.actions.updateTriggerOrder(position.id, kind, triggerPrice, existingOrderId);
      } finally {
        // A trigger edit changes orders only (llms.txt §10).
        trading.refetchOrders();
      }
    });

  const handleCancelOrder = (order: HlOrderRow) =>
    withBusy(async () => {
      try {
        await trading.actions.cancelOrder(order.id);
      } finally {
        // A cancel changes orders only (llms.txt §10).
        trading.refetchOrders();
      }
    });

  // --- placing the order -------------------------------------------------
  // The whole sequence moved across from HyperliquidOrderForm unchanged, in the
  // same order and with the same guarantees:
  //
  //   * The chosen leverage and margin mode are PUSHED to the account before
  //     the order, not left in local state. Without that, "isolated 10x" opened
  //     as whatever the Hyperliquid account already had (the 1 Sept test: 20x
  //     cross). A failure here aborts the order rather than opening a position
  //     with unknown risk settings.
  //   * The positions snapshot is taken BEFORE the order, so the background
  //     poll can tell a landed fill from stale data.
  //   * Hyperliquid can accept the entry while rejecting a TP or SL leg of the
  //     batch. The backend reports that honestly and so does this: hiding it
  //     would leave a trader believing they hold a bracket they do not.
  const handlePlaceOrder = (side: HlOrderSide) => {
    if (!asset || !size || !minNotionalMet) return;
    if (orderMode === "limit" && !limitPrice) return;
    if (triggerReasonFor(side) !== null) return;
    setOrderStatus(null);
    setPendingSide(side);
    void withBusy(async () => {
      // What the ticket asked for, fixed before the fields are cleared.
      const ticket: PerpTicket = {
        market: asset.symbol,
        side,
        orderMode,
        leverage: clampedLeverage,
        marginMode,
        collateralUsd: collateralUsdcNum,
        notionalUsd: notionalUsdc,
        markPrice,
        limitPrice,
        takeProfitPrice: triggersOpen ? takeProfitPrice : "",
        stopLossPrice: triggersOpen ? stopLossPrice : "",
      };
      // The order as it is about to be sent. Reported before the venue has
      // said anything, so an order that never comes back is still counted.
      const order = perpOrderProps(ticket);
      try {
        setPendingStatus(t("preparingTrade"));
        await trading.actions.updateLeverage(asset.symbol, clampedLeverage, marginMode);
        setPendingStatus(t("placingOrder"));
        track("perp_order_submitted", order);
        const before = JSON.stringify(trading.positions.map((p) => [p.id, p.size]).sort());
        const result = await trading.actions.placeOrder(
          {
            assetSymbol: asset.symbol,
            side,
            size,
            limitPrice: orderMode === "limit" ? limitPrice : undefined,
            takeProfitPrice: triggersOpen ? takeProfitPrice || undefined : undefined,
            stopLossPrice: triggersOpen ? stopLossPrice || undefined : undefined,
          },
          (text) => setPendingStatus(text)
        );
        trading.refetchAll();
        // The same poll, and the same predicate — but its answer is the fill,
        // not just a cue to refresh, and it used to be discarded. The order
        // response above says the entry was ACCEPTED; a position appearing
        // under that entry order's id is what says it FILLED.
        //
        // Awaited in a `then`, never inline: the busy state and the order
        // status below must not wait thirty seconds on a poll.
        //
        // A limit order that only rests never produces a position under its
        // id, so it posts nothing, which is exactly what ADR-2026-09-24
        // section 4 asks for. A TP or SL leg rejected beside a filled entry
        // still posts, because the entry still filled.
        const pair = hlPairLabel(asset.symbol);
        const entryOrderId = result.entryOrder.id;
        let filledRows: HlPositionView[] | null = null;
        void trading
          .waitForPositionsChange((rows) => {
            const changed = JSON.stringify(rows.map((p) => [p.id, p.size]).sort()) !== before;
            if (changed) filledRows = rows;
            return changed;
          })
          .then((changed) => {
            if (!changed || filledRows === null) return;
            const opened = filledRows.find((p) => p.entryOrderId === entryOrderId);
            // The snapshot moved for some other reason — a trigger firing on
            // another market, the backend's reconciliation sweep. This order
            // did not fill, so nothing is claimed for it.
            if (!opened) return;
            reportShine({
              service: "perps",
              // The entry order id, which is also what the venue keys the
              // position's own entryOrderId on.
              id: entryOrderId,
              kind: "open",
              symbol: pair,
              side: opened.side,
              // A multiplier, not money: the venue's own record of what this
              // position was opened at, rather than what the ticket asked for.
              leverage: opened.leverage,
              price: entryPriceFromUsdString(opened.entryPrice),
            });
          });
        void trading.waitForPositionsChange(
          (rows) => JSON.stringify(rows.map((p) => [p.id, p.size]).sort()) !== before
        );
        const openedProps = perpOpenedProps(ticket, result.entryOrder);
        if (openedProps) track("perp_trade_opened", openedProps);

        const rejectedLegs = [
          result.takeProfitOrder?.status === "rejected" ? t("takeProfit") : null,
          result.stopLossOrder?.status === "rejected" ? t("stopLoss") : null,
        ].filter((leg): leg is string => leg !== null);
        if (rejectedLegs.length > 0) {
          setOrderStatus({
            text: t("triggerLegsRejected", { legs: rejectedLegs.join(", ") }),
            kind: "error",
          });
        } else {
          const pair = hlPairLabel(asset.symbol);
          setOrderStatus({
            text:
              orderMode === "market"
                ? side === "buy"
                  ? t("longOpen", { pair })
                  : t("shortOpen", { pair })
                : t("orderRestsUntilTrigger", { pair }),
            kind: "success",
          });
        }
        setCollateralUsdc("");
        setLimitPrice("");
        setTakeProfitPrice("");
        setStopLossPrice("");
      } catch (error) {
        const details = (error as GatewayApiError)?.details;
        track("perp_trade_failed", {
          pair: order.pair,
          direction: order.direction,
          // The desk checks the margin itself and gets a structured answer, so
          // it says so outright rather than reading it back off the message.
          ...(isInsufficientMarginDetails(details)
            ? { reason: "insufficient_margin" as const }
            : reasonFor(PERP_FAILURE, error)),
          leverage: order.leverage,
          margin_mode: order.margin_mode,
          collateral_usd: order.collateral_usd,
        });
        if (isInsufficientMarginDetails(details)) {
          setOrderStatus({
            text: t("stillShortAfterTopUp", {
              have: details.withdrawableUsdc,
              need: details.requiredUsdc,
            }),
            kind: "error",
          });
          return;
        }
        if (isBridgeMinimumDetails(details)) {
          setOrderStatus({
            text: t("belowBridgeMinimum", {
              min: details.minDepositUsdc,
              have: details.arbitrumBalanceUsdc,
            }),
            kind: "error",
          });
          return;
        }
        setOrderStatus({
          text: scrubVenue(friendlyError(error, t("tradeOpenFailed"))),
          kind: "error",
        });
      } finally {
        setPendingSide(null);
        setPendingStatus(null);
      }
    });
  };

  const signedOut = !trading.authenticated;

  // 24h change for the ticket's pair strip, read off the market contexts the
  // market list already has on hand. Display only: no extra request, and no
  // query option touched.
  const assetContext = asset ? (contexts.find((c) => c.symbol === asset.symbol) ?? null) : null;
  const changePct =
    assetContext && Number(assetContext.prevDayPrice) > 0
      ? ((Number(assetContext.markPrice) - Number(assetContext.prevDayPrice)) /
          Number(assetContext.prevDayPrice)) *
        100
      : null;
  // One formatting of the 24h change, read by the ticket's pair strip and, in
  // fullscreen only, by the chart header.
  const changeLabel =
    changePct != null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : null;
  const changeDirection: "up" | "down" | null =
    changePct == null ? null : changePct >= 0 ? "up" : "down";

  const marketsPending = signedOut || (trading.assetsLoading && trading.assets.length === 0);

  const buyLiquidation = liquidationFor("long");
  const sellLiquidation = liquidationFor("short");
  // The estimator hands back a plain decimal string. Turning it into currency
  // is the display edge and nothing downstream does arithmetic on it.
  const liquidationDisplay = (estimate: LiquidationEstimate): string | null =>
    estimate.status === "ok" ? formatUsd(Number(estimate.price)) : null;
  // The two reasons a trader meets in normal use get a sentence of their own, so
  // an empty row reads as deliberate rather than broken. Everything else falls
  // through to the ticket's generic line.
  const liquidationReason =
    buyLiquidation.status === "unavailable"
      ? buyLiquidation.reason
      : sellLiquidation.status === "unavailable"
        ? sellLiquidation.reason
        : null;
  const liquidationNote =
    liquidationReason === "existingPosition" && asset
      ? t("liquidationExistingPosition", { symbol: asset.symbol })
      : liquidationReason === "unreachable"
        ? t("liquidationUnreachable")
        : null;

  // What stops BOTH sides. The quantity, the price and the venue's minimum are
  // the ticket's own gates; these are the ones only the desk can see. Order
  // matters: the most specific thing that is wrong is the most useful to say.
  const walletReady = !trading.assetsLoading && trading.walletId != null;
  const ticketBlockedReason = !asset
    ? t("pickMarket")
    : !walletReady
      ? t("noWalletConnected")
      : markPrice <= 0
        ? t("marketUnavailable")
        : busy && pendingSide === null
          ? t("working")
          : null;

  // ChartPanelShell only draws its fullscreen control when it is handed an
  // expand label, so the affordance stays hidden until the perps catalog
  // carries these two keys. They are not in messages/*.json yet and this file
  // must not invent English for them: `has` is what keeps a missing key from
  // rendering as the key name.
  const expandChartLabel = t.has("expandChart") ? t("expandChart") : undefined;
  const exitChartFullscreenLabel = t.has("exitChartFullscreen")
    ? t("exitChartFullscreen")
    : undefined;

  return (
    // Kept from the previous layout: broadcast mode blurs anything marked
    // sensitive, and this whole desk is position data.
    <div data-sensitive="position">
      {/* Shine, above the desk rather than behind a settings sheet. It is on
          by default and posts a filled order publicly without asking each
          time, so the place someone finds out about it has to be the screen
          they are trading on. This is the only perps interface in the app, so
          one placement here covers /perps, the deep-linked terminal and the
          phone Market tab. */}
      <LeverageDesktopLayout
        // The design's ticket is a fixed 924px. Held as a floor rather than a
        // fixed height, because the order form grows with margin mode, TP/SL
        // and error text, and the ticket clips its overflow: a taller form
        // inside a fixed 924px box would cut off the submit button. The
        // min-[1080px] gate the layout puts on that height is untouched.
        ticketClassName="min-[1080px]:h-auto min-[1080px]:min-h-[924px]"
        // NO marketListClassName. This used to restate the layout's 682px
        // market-column height, because Tailwind was dropping the class in
        // leverage-desktop-layout.tsx where it sat against a `${...}`
        // interpolation. That file now spaces the class off the interpolation
        // and sizes the list panel as flex-1 inside a column the chart shares,
        // so a fixed height here would fight it and put the two columns at
        // different depths.
        //
        // SLOT LEFT EMPTY: search. The only market search in this feature is
        // the input inside HyperliquidAssetPicker's own dropdown, which is
        // what fills the market column below. There is no standalone search
        // field to put on this rail.
        //
        // Closest existing component to the design's always-open market
        // table. The picker is a trigger plus a dropdown, not an inline
        // table, so the column shows the selected market and opens the full
        // Market/Last Price/24h Change/Funding/Volume/OI list on click.
        //
        // That click is why the caret on THIS card is still there, and it is
        // the reason the caret removed for the same request was the other one.
        // There were two pills reading "BTC-USDC" with a chevron: this card,
        // and the pair pill inside PerpOrderTicket. The ticket's opened
        // nothing (its handler scrolled to a ref that was never attached) and
        // told a screen reader it owned a listbox, so it is a plain badge now.
        // This card IS the market picker, the only one on the desk, and its
        // caret is the whole of what says so: taking it off would leave a live
        // control with no affordance, which is worse than the noise the
        // request was aimed at. It is also not drawn here, it belongs to
        // HyperliquidAssetPicker, so changing it is that file's call.
        marketList={
          marketsPending ? null : (
            <div className="p-3">
              <HyperliquidAssetPicker
                assets={trading.assets}
                prices={trading.prices}
                contexts={contexts}
                selected={asset?.symbol ?? ""}
                onSelect={setSelectedSymbol}
                loading={trading.assetsLoading}
              />
            </div>
          )
        }
        marketListFallback={
          <div className="grid size-full place-items-center px-6 py-10 text-center text-sm font-normal text-white/55">
            {signedOut ? t("signInToTrade") : t("loadingMarkets")}
          </div>
        }
        // SLOT LEFT EMPTY: ticketHeader. The design puts a market-select
        // trigger and its 24h change here. HyperliquidMarketHeader is a
        // six-stat strip that cannot fit the 470px ticket, and the compact
        // asset picker's dropdown would be clipped by the ticket's own
        // overflow. The market identity and mark price are carried by the
        // market card at the top of the left column, which is the only copy of
        // them in the panel: the chart panel used to repeat all three and the
        // user asked for that repeat to go. Fullscreen is the exception, and it
        // is handled on the chart slot below. The pair pill PerpOrderTicket
        // brings is what fills this gap when that ticket is adopted.
        //
        // SLOT LEFT EMPTY: modeSwitch. There is no longer a simple/pro switch
        // anywhere in perps. PerpModeSwitch is orphaned (perp-mode.tsx).
        //
        // The toggle and the chart are two slots, and the layout puts both in
        // the left column under the market list. Closing the chart also drops
        // fullscreen: the control that would bring the user back out of it
        // lives in the chart's own header.
        chartToggle={
          <ChartPanelToggle
            open={chartOpen}
            onOpenChange={(open) => {
              setChartOpen(open);
              if (!open) setChartFullscreen(false);
            }}
            label={chartOpen ? t("closeChart") : t("showChart")}
          />
        }
        chartOpen={chartOpen}
        chart={
          <ChartPanelShell
            // Fullscreen lifts the panel out of the column onto a fixed
            // backdrop. The element is not swapped out, only re-styled, so the
            // TradingView iframe is not torn down and rebuilt on every toggle.
            className={chartFullscreen ? "fixed inset-0 z-50 bg-black p-4" : undefined}
            height={
              chartFullscreen && chartFullscreenHeight > 0 ? chartFullscreenHeight : undefined
            }
            fullscreen={chartFullscreen}
            onFullscreenChange={setChartFullscreen}
            labels={{
              loading: t("chartLoading"),
              empty: t("chartEmpty"),
              error: t("chartError"),
              expand: expandChartLabel,
              exitFullscreen: exitChartFullscreenLabel,
            }}
            // The market identity, in FULLSCREEN ONLY. In the panel the market
            // card sits directly above the chart, so repeating the pair, the
            // change and the mark price under it was the duplicate the user
            // asked to remove, and the shell raises its header row on the
            // fullscreen control alone, so leaving these out there costs no
            // affordance. Fullscreen lifts the panel onto a backdrop that card
            // is not on, which leaves the chart with no identity at all unless
            // it carries its own. Hence the gate rather than either extreme.
            //
            // The pair used to be a badge here, because the only picker was the
            // market card behind the overlay and a trigger with nothing to open
            // is worse than no trigger. The user asked to be able to change
            // market from fullscreen, so the picker comes onto the overlay
            // instead: the same HyperliquidAssetPicker the column renders, on
            // the same assets, the same contexts and the same onSelect, so this
            // is one picker in two places rather than two pickers. The pill's
            // chrome is on the wrapper so the header keeps the shape it had.
            //
            // Not gated on `asset`, unlike the price and the change below. The
            // shell pins its header out of flow when it is handed no identity
            // at all, which on a fixed overlay parks the exit control above the
            // top of the viewport; before markets load there was nothing to
            // hand it. The picker is always something, and it says "Loading…"
            // or "No markets" itself.
            marketPicker={
              chartFullscreen ? (
                <div
                  ref={fullscreenPickerRef}
                  className="bg-surface border-hairline flex h-10 min-w-0 items-center rounded-2xl border-[1.7px] px-[11px]"
                >
                  <HyperliquidAssetPicker
                    key={fullscreenPickerRun}
                    compact
                    assets={trading.assets}
                    prices={trading.prices}
                    contexts={contexts}
                    selected={asset?.symbol ?? ""}
                    onSelect={setSelectedSymbol}
                    loading={trading.assetsLoading}
                  />
                </div>
              ) : undefined
            }
            price={chartFullscreen && markPrice > 0 ? formatUsd(markPrice) : undefined}
            change={chartFullscreen ? (changeLabel ?? undefined) : undefined}
            changeDirection={chartFullscreen ? (changeDirection ?? undefined) : undefined}
            state={asset ? "ready" : marketsPending ? "loading" : "empty"}
          >
            {asset ? (
              <TradingViewChart
                symbol={tradingViewSymbolForAsset(asset.symbol, asset.category)}
                height="100%"
              />
            ) : null}
          </ChartPanelShell>
        }
        // The 2.0 desktop ticket, in place of HyperliquidOrderForm. It covers
        // the orderSummary and directionActions slots itself, which is why both
        // stay empty below.
        //
        // The number in its quantity field is COLLATERAL in USDC, drawn from the
        // HyperCore margin balance, exactly as the form it replaces read its own
        // amount. Everything derived from it (notional, wire size, the minimum
        // check, the liquidation estimate) is computed above from that reading.
        //
        // Top up and Withdraw sit under the ticket rather than inside it: they
        // move USDC in and out of the perps account and are not order entry. The
        // ticket says so itself and exposes nothing for them.
        orderEntry={
          signedOut ? null : (
            <div className="flex w-full flex-col gap-3">
              <PerpOrderTicket
                pair={asset ? hlPairLabel(asset.symbol) : ""}
                change24h={changeLabel ?? "\u2014"}
                changeDirection={changeDirection ?? "flat"}
                mode={orderMode}
                onModeChange={(next) => {
                  setOrderMode(next);
                  // Same as the form's own kind switch: leaving a stale limit
                  // price behind would send it with the next market order.
                  if (next === "market") setLimitPrice("");
                }}
                // Read-only mark price on a market order, an editable field on a
                // limit one. Supplying the handler is what turns the row into a
                // field, so it is supplied only for limit.
                price={
                  orderMode === "limit" ? limitPrice : markPrice > 0 ? formatUsd(markPrice) : ""
                }
                onPriceChange={orderMode === "limit" ? setLimitPrice : undefined}
                quoteSymbol={COLLATERAL_SYMBOL}
                priceLoading={marketsPending}
                quantity={collateralUsdc}
                onQuantityChange={setCollateralUsdc}
                quantityAsset={{
                  balance: collateralBalance,
                  decimals: COLLATERAL_DECIMALS,
                  symbol: COLLATERAL_SYMBOL,
                }}
                // Warn, never block. placeOrder detects a short HyperCore
                // balance, bridges from Arbitrum and retries, so an amount over
                // the withdrawable figure is routinely placeable and a hard gate
                // would take that path away. The only balance this desk can name
                // excludes those bridgeable funds.
                overBalancePolicy="warn"
                leverage={clampedLeverage}
                onLeverageChange={setLeverage}
                maxLeverage={maxLeverage}
                marginMode={marginMode}
                onMarginModeChange={setMarginMode}
                triggers={{
                  open: triggersOpen,
                  onOpenChange: setTriggersOpen,
                  takeProfit: { value: takeProfitPrice, onChange: setTakeProfitPrice },
                  stopLoss: { value: stopLossPrice, onChange: setStopLossPrice },
                  projection: triggerProjection,
                }}
                summary={{
                  orderValue: notionalUsdc > 0 ? formatUsd(notionalUsdc) : "\u2014",
                  entryPrice: entryPriceNum > 0 ? formatUsd(entryPriceNum) : "\u2014",
                  liquidation: {
                    buy: liquidationDisplay(buyLiquidation),
                    sell: liquidationDisplay(sellLiquidation),
                    unavailableNote: liquidationNote,
                  },
                  openingFee: notionalUsdc > 0 ? formatUsd(openFee(notionalUsdc)) : "\u2014",
                }}
                minNotional={{
                  met: minNotionalMet,
                  label: formatUsd(MIN_ORDER_NOTIONAL_USDC),
                }}
                onBuy={() => handlePlaceOrder("buy")}
                onSell={() => handlePlaceOrder("sell")}
                pending={pendingSide}
                pendingStatus={pendingStatus}
                blockedReason={ticketBlockedReason}
                // A crossed bracket stops one direction, not both: the same
                // take profit that is wrong for a long is right for a short.
                sideBlockedReasons={{
                  buy: triggerReasonFor("buy"),
                  sell: triggerReasonFor("sell"),
                }}
              />

              {orderStatus ? (
                <p
                  role="status"
                  aria-live="polite"
                  className={`text-center text-[13px] font-normal ${
                    orderStatus.kind === "error" ? "text-down" : "text-up"
                  }`}
                >
                  {orderStatus.text}
                </p>
              ) : null}

              {/* Moving USDC in and out of the perps account. Both were on
                  HyperliquidOrderForm's own footer and neither is order entry,
                  so they move here with their modals and their wiring
                  unchanged. A trader must always be able to get money out.

                  One row, split evenly, in PerpOrderTicket's ActionButton
                  geometry: the same h-12, rounded-3xl, border-2, gap-2 and
                  16px semibold Inter as the Buy/Sell pair directly above, so
                  the two rows read as one family. NOT bg-buy or bg-sell. Those
                  two tokens mean "this places an order"; these move collateral,
                  and a green button that is not Buy sitting under Buy is the
                  worst thing this column could do. They take the neutral
                  surface tokens instead, filled for Top up and outlined for
                  Withdraw, which puts them a clear step below the saturated
                  pair without making either look disabled. */}
              <div className="flex w-full items-start gap-2 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={() => setFundOpen(true)}
                  disabled={!trading.walletId || busy}
                  // When the entered collateral outruns the HyperCore balance the
                  // button takes the same kash accent as the ticket's "may bridge"
                  // advisory, so the note and the way to clear it read as one
                  // thing. The order still places either way; this only makes
                  // funding up front the obvious move.
                  className={`bg-surface-strong flex h-12 min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center rounded-3xl border-2 font-[family-name:var(--font-sportsbook)] text-[16px] font-semibold transition-all hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-45 ${
                    emphasizeTopUp
                      ? "border-kash text-kash shadow-[0_0_0_3px_rgba(255,214,47,0.18)]"
                      : "border-hairline text-white"
                  }`}
                >
                  {trading.walletId ? t("topUp") : t("topUpPreparing")}
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawOpen(true)}
                  disabled={!trading.walletId || busy || collateralBalance <= 0n}
                  className="border-hairline hover:bg-surface flex h-12 min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center rounded-3xl border-2 bg-transparent font-[family-name:var(--font-sportsbook)] text-[16px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {t("withdraw")}
                </button>
              </div>

              <HyperliquidFundModal
                open={fundOpen}
                onClose={() => setFundOpen(false)}
                walletId={trading.walletId}
                onDeposit={(amountUsdc, onStage) =>
                  withBusy(() => trading.actions.depositToPerps(amountUsdc, onStage))
                }
                onFunded={handleWalletChanged}
              />
              <HyperliquidWithdrawModal
                open={withdrawOpen}
                onClose={() => setWithdrawOpen(false)}
                walletId={trading.walletId}
                availableUsdc={withdrawableUsdc}
                onWithdraw={(total, onStatus) =>
                  withBusy(() => trading.actions.withdraw(total, onStatus))
                }
                onWithdrawn={handleWalletChanged}
              />
            </div>
          )
        }
        ticketFallback={
          <div className="grid place-items-center px-6 py-10 text-center text-sm font-normal text-white/55">
            {t("signInToTrade")}
          </div>
        }
        // SLOTS LEFT EMPTY: orderSummary and directionActions. PerpOrderTicket
        // is one component covering order entry, the summary and the Buy/Sell
        // pair, so it fills orderEntry alone and these two stay empty.
        //
        // Positions and orders, full width below both columns.
        ledger={
          signedOut ? null : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <HyperliquidPositionsList
                positions={trading.positions}
                orders={trading.orders}
                loading={trading.positionsLoading}
                busy={busy}
                walletId={trading.walletId}
                onClosePosition={handleClosePosition}
                onEditTrigger={handleEditTrigger}
              />
              <HyperliquidOrdersList
                orders={trading.orders}
                loading={trading.ordersLoading}
                busy={busy}
                onCancel={handleCancelOrder}
              />
            </div>
          )
        }
      />
    </div>
  );
}
