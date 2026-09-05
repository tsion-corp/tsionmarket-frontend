"use client";

import { useEffect, useState } from "react";
import { closeFee, formatAmount, formatUsd, openFee, PERPS_TAKER_FEE_RATE } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";
import { HyperliquidFundModal } from "@/features/trade/components/hyperliquid-fund-modal";
import { HyperliquidWithdrawModal } from "@/features/trade/components/hyperliquid-withdraw-modal";
import {
  isBridgeMinimumDetails,
  isInsufficientMarginDetails,
} from "@/features/trade/lib/hyperliquid-types";
import type {
  HlClearinghouseState,
  HlMarginMode,
  HlOrderSide,
  HlPositionView,
  PlaceOrderResult,
} from "@/features/trade/lib/hyperliquid-types";
import type { GatewayApiError } from "@/lib/api/envelope";

interface HyperliquidOrderFormProps {
  assetSymbol: string;
  maxLeverage: number;
  markPrice: number;
  /** Base-unit decimal precision for this asset — sizes the percent slider rounds to. */
  szDecimals: number;
  /** Withdrawable HyperCore margin, USDC — the percent slider's 100% basis. */
  availableMarginUsdc: number;
  /** This wallet's open position in the selected asset, if any. */
  currentPosition: HlPositionView | null;
  walletId: string | null;
  clearinghouse: HlClearinghouseState | null;
  walletReady: boolean;
  busy: boolean;
  onSubmit: (
    input: {
      assetSymbol: string;
      side: HlOrderSide;
      size: string;
      limitPrice?: string;
      takeProfitPrice?: string;
      stopLossPrice?: string;
    },
    onStatus?: (status: string) => void
  ) => Promise<PlaceOrderResult>;
  onUpdateLeverage: (
    assetSymbol: string,
    leverage: number,
    marginMode: HlMarginMode
  ) => Promise<void>;
  onBridge: () => Promise<void>;
  onWithdraw: (
    amountUsdc: string,
    onStatus?: (status: string) => void
  ) => Promise<{ treasuryMovementId: string }>;
  onFunded: () => void;
  /** Real measured row height (see HyperliquidProPerps) — undefined lets the
   *  card size to its own natural content, for the stacked/mobile layout. */
  height?: number;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
// Hyperliquid rejects any order below this notional outright — enforced
// client-side too so a tiny amount fails fast with a clear reason instead
// of round-tripping to Hyperliquid first (error: "Order must have minimum
// value of $10").
const MIN_ORDER_NOTIONAL_USDC = 10;
type OrderKind = "market" | "limit";
type StatusKind = "info" | "success" | "error";
interface FormStatus {
  text: string;
  kind: StatusKind;
}

// The full order ticket: settings pills (margin mode, leverage), entry
// (market or limit) with optional TP/SL, and the wallet's deposit/withdraw
// actions — one card, matching Hyperliquid's own pro layout. Wallet balance
// lives here rather than in a separate card because that's how the
// reference layout treats it: settings and money, one panel.
//
// HyperCore's own account-abstraction mode (Manual/Unified/Portfolio,
// see useHyperliquidActions' getAbstractionMode/setAbstractionMode) is
// deliberately NOT surfaced here: it governs the TREASURY's own eligibility
// to collect builder fees, not anything about an individual trader's own
// orders (fee attachment is gated on builder-fee approval, handled silently
// per wallet — see ensureBuilderFeeApproved in hyperliquid-actions.ts).
// Exposing it as a trader-facing toggle would only risk someone switching
// their own account into a real margin mode they didn't mean to.
export function HyperliquidOrderForm({
  assetSymbol,
  maxLeverage,
  markPrice,
  szDecimals,
  availableMarginUsdc,
  currentPosition,
  walletId,
  clearinghouse,
  walletReady,
  busy,
  onSubmit,
  onUpdateLeverage,
  onBridge,
  onWithdraw,
  onFunded,
  height,
}: HyperliquidOrderFormProps) {
  const [side, setSide] = useState<HlOrderSide>("buy");
  const [orderKind, setOrderKind] = useState<OrderKind>("market");
  // Trading amount is entered in USDC as COLLATERAL, matching the simple
  // view: leverage multiplies it into the position's notional, and size (the
  // asset's own base units, what Hyperliquid's API actually wants) is derived
  // from that notional at submit time. Treating the amount as notional made
  // 10x trade exactly like 1x on the entered dollars.
  const [amountUsdc, setAmountUsdc] = useState("");
  const [sizePercent, setSizePercentValue] = useState(0);
  const [limitPrice, setLimitPrice] = useState("");
  const [showTriggers, setShowTriggers] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [leverage, setLeverage] = useState(Math.min(5, maxLeverage));
  const [marginMode, setMarginMode] = useState<HlMarginMode>("cross");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // Clears itself a few seconds after the action actually finishes — never
  // while `busy` (that would wipe the live "bridging…" / "placing order…"
  // progress text mid-flight), only once a final success/error message is
  // showing.
  useEffect(() => {
    if (!status || busy) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status, busy]);

  const decimalField =
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value.replace(/,/g, "");
      if (next === "" || DECIMAL_INPUT.test(next)) setter(next);
    };

  const selectOrderKind = (kind: OrderKind) => {
    setOrderKind(kind);
    if (kind === "market") setLimitPrice("");
  };

  // The percent slider's 100% is the wallet's actual perps balance — plain
  // and literal, not scaled by leverage.
  const maxUsdc = availableMarginUsdc;
  const setSizePercent = (pct: number) => {
    setSizePercentValue(pct);
    if (maxUsdc <= 0) return;
    setAmountUsdc((Math.floor(((maxUsdc * pct) / 100) * 100) / 100).toFixed(2));
  };

  const amountUsdcNum = Number(amountUsdc) || 0;
  const clampedLeverage = Math.max(1, Math.min(leverage, maxLeverage));
  const notionalUsdc = amountUsdcNum * clampedLeverage;
  const sizeDecimals = Math.max(0, Math.min(8, szDecimals));
  // Floored to the asset's own size precision so the wire size never exceeds
  // what the entered collateral actually covers.
  const sizeScale = 10 ** sizeDecimals;
  const sizeBaseUnits =
    markPrice > 0 ? Math.floor((notionalUsdc / markPrice) * sizeScale) / sizeScale : 0;
  const size = sizeBaseUnits > 0 ? sizeBaseUnits.toFixed(sizeDecimals) : "";
  // Advisory only — never blocks submission. placeOrder already auto-bridges
  // and retries when the perps wallet alone falls short (see
  // hyperliquid-actions.ts), so this can under-count real buying power; it's
  // a fast, honest hint, not the authoritative check. The amount IS the
  // margin under collateral semantics, so it compares against the balance
  // directly, un-scaled.
  const insufficientBalance = amountUsdcNum > 0 && amountUsdcNum > maxUsdc;
  // Unlike insufficientBalance, this ALWAYS blocks — no retry or auto-bridge
  // fixes an order Hyperliquid rejects outright for being too small. The $10
  // floor applies to the position's notional, not the collateral.
  const belowMinimumOrder = notionalUsdc > 0 && notionalUsdc < MIN_ORDER_NOTIONAL_USDC;

  // TP/SL must sit on the correct side of entry for the direction: a long
  // takes profit above and stops out below, a short the other way round. A
  // crossed pair is a long's bracket on a short (or vice versa) — the exact
  // configuration that reached Hyperliquid unchecked in the 1 Sept test and
  // got the trigger legs rejected after the entry had already filled. The
  // backend re-validates; catching it here just fails before anything is
  // signed.
  const triggerValidationError = (): string | null => {
    if (!showTriggers) return null;
    const reference = orderKind === "limit" ? Number(limitPrice) : markPrice;
    if (!(reference > 0)) return null;
    const tp = Number(takeProfitPrice) || 0;
    const sl = Number(stopLossPrice) || 0;
    const isLong = side === "buy";
    if (tp > 0 && (isLong ? tp <= reference : tp >= reference)) {
      return isLong
        ? "Take profit must be above the entry price for a long."
        : "Take profit must be below the entry price for a short.";
    }
    if (sl > 0 && (isLong ? sl >= reference : sl <= reference)) {
      return isLong
        ? "Stop loss must be below the entry price for a long."
        : "Stop loss must be above the entry price for a short.";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!assetSymbol || !size || belowMinimumOrder) return;
    if (orderKind === "limit" && !limitPrice) return;
    const triggerError = triggerValidationError();
    if (triggerError) {
      setStatus({ text: triggerError, kind: "error" });
      return;
    }
    try {
      // The selected leverage/margin mode used to live only in this form's
      // state unless the user found the separate "Update" button — the order
      // then opened at whatever the Hyperliquid account already had (the 1
      // Sept test: "isolated 10x" opening as 20x cross). Apply them as part
      // of placing the order; a failure here aborts the order rather than
      // opening a position with unknown risk settings.
      setStatus({ text: "Applying leverage…", kind: "info" });
      await onUpdateLeverage(assetSymbol, Math.min(leverage, maxLeverage), marginMode);
      setStatus({ text: "Placing order…", kind: "info" });
      const result = await onSubmit(
        {
          assetSymbol,
          side,
          size,
          limitPrice: orderKind === "limit" ? limitPrice : undefined,
          takeProfitPrice: showTriggers ? takeProfitPrice || undefined : undefined,
          stopLossPrice: showTriggers ? stopLossPrice || undefined : undefined,
        },
        (text) => setStatus({ text, kind: "info" })
      );
      // Hyperliquid can accept the entry while rejecting a TP/SL leg of the
      // batch — the backend now reports that honestly instead of failing the
      // whole call, and hiding it here would recreate the old lie.
      const rejectedLegs = [
        result.takeProfitOrder?.status === "rejected" ? "take profit" : null,
        result.stopLossOrder?.status === "rejected" ? "stop loss" : null,
      ].filter((leg): leg is string => leg !== null);
      if (rejectedLegs.length > 0) {
        const reason =
          result.takeProfitOrder?.rejectionReason ?? result.stopLossOrder?.rejectionReason;
        setStatus({
          text: `Order placed, but the ${rejectedLegs.join(" and ")} ${
            rejectedLegs.length > 1 ? "were" : "was"
          } rejected${reason ? ` (${reason})` : ""} — set ${
            rejectedLegs.length > 1 ? "them" : "it"
          } again from your open position.`,
          kind: "error",
        });
      } else {
        setStatus({
          text:
            orderKind === "market"
              ? `${side === "buy" ? "Long" : "Short"} ${assetSymbol} opened.`
              : `${side === "buy" ? "Buy" : "Sell"} order for ${assetSymbol} placed.`,
          kind: "success",
        });
      }
      setAmountUsdc("");
      setSizePercentValue(0);
      setLimitPrice("");
      setTakeProfitPrice("");
      setStopLossPrice("");
    } catch (error) {
      const details = (error as GatewayApiError)?.details;
      if (isInsufficientMarginDetails(details)) {
        setStatus({
          text: `Still short on balance after automatically topping up (have $${details.withdrawableUsdc}, need $${details.requiredUsdc}) — top up more, then retry.`,
          kind: "error",
        });
        return;
      }
      if (isBridgeMinimumDetails(details)) {
        setStatus({
          text: `Insufficient balance — minimum is $${details.minDepositUsdc} (you have $${details.arbitrumBalanceUsdc}). Top up more, then retry.`,
          kind: "error",
        });
        return;
      }
      setStatus({ text: friendlyError(error, "Order failed."), kind: "error" });
    }
  };

  const handleLeverage = async () => {
    if (!assetSymbol) return;
    setStatus(null);
    // Clamped to the ASSET's max, matching every display of this value —
    // the raw state can exceed it after switching from a higher-max market,
    // and sending that had the pill reading "10x" while the request said 40.
    const clampedLeverage = Math.min(leverage, maxLeverage);
    try {
      await onUpdateLeverage(assetSymbol, clampedLeverage, marginMode);
      setStatus({
        text: `Leverage set to ${clampedLeverage}x (${marginMode}) for ${assetSymbol}.`,
        kind: "success",
      });
    } catch (error) {
      setStatus({
        text: friendlyError(error, "Leverage update failed."),
        kind: "error",
      });
    }
  };

  const withdrawable = clearinghouse ? Number(clearinghouse.withdrawable) : null;
  const positionSizeLabel = currentPosition
    ? `${currentPosition.side === "short" ? "-" : ""}${formatAmount(Number(currentPosition.size))} ${assetSymbol}`
    : `0.00000 ${assetSymbol || ""}`.trim();

  const orderValueUsdc = notionalUsdc;
  const marginRequiredUsdc = amountUsdcNum;

  return (
    <div
      className="ws-card flex flex-col overflow-hidden p-4 sm:p-5"
      style={height ? { height } : undefined}
    >
      {/* Header: settings pills + Market/Limit tabs — pinned, never scrolls. */}
      <div className="flex-none">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="cursor-pointer rounded-xl border border-white/10 bg-white/4 py-2.5 text-[13px] font-semibold text-white capitalize transition-colors hover:border-white/25"
          >
            {marginMode}
          </button>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="tnum cursor-pointer rounded-xl border border-white/10 bg-white/4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:border-white/25"
          >
            {Math.min(leverage, maxLeverage)}x
          </button>
        </div>

        {settingsOpen ? (
          <div className="ws-inset mt-2 flex flex-wrap items-center gap-3 p-3">
            <div className="flex gap-1 rounded-lg bg-white/4 p-1">
              {(["cross", "isolated"] as HlMarginMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMarginMode(mode)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors ${
                    marginMode === mode
                      ? "bg-white/10 text-white"
                      : "text-white/45 hover:text-white/70"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(1, maxLeverage)}
              step={1}
              value={Math.min(leverage, maxLeverage)}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="accent-accent h-1.5 flex-1"
            />
            <span className="tnum text-sm font-semibold text-white">
              {Math.min(leverage, maxLeverage)}x
            </span>
            <button
              onClick={() => void handleLeverage()}
              disabled={busy || !walletReady || !assetSymbol}
              className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Update
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex gap-5 border-b border-white/10">
          {(["market", "limit"] as OrderKind[]).map((kind) => (
            <button
              key={kind}
              onClick={() => selectOrderKind(kind)}
              className={`cursor-pointer border-b-2 pb-2 text-[13.5px] font-semibold capitalize transition-colors ${
                orderKind === kind
                  ? "border-up text-white"
                  : "border-transparent text-white/45 hover:text-white/70"
              }`}
            >
              {kind}
            </button>
          ))}
        </div>
      </div>

      {/* Body: entry + preview stats — the part that scrolls if the viewport
          is short. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("buy")}
            className={`cursor-pointer rounded-xl p-3 text-sm font-semibold transition-colors ${
              side === "buy"
                ? "border-up/40 bg-up/16 text-up border"
                : "border border-white/10 bg-white/4 text-white/55"
            }`}
          >
            Buy / Long
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`cursor-pointer rounded-xl p-3 text-sm font-semibold transition-colors ${
              side === "sell"
                ? "border-down/40 bg-down/14 text-down border"
                : "border border-white/10 bg-white/4 text-white/55"
            }`}
          >
            Sell / Short
          </button>
        </div>

        <div className="mt-3 flex justify-between text-[12.5px] font-normal">
          <span className="text-white/55">Available to Trade</span>
          <span className="tnum text-white">{formatUsd(maxUsdc)}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-[12.5px] font-normal">
          <span className="text-white/55">Current Position</span>
          <span className="tnum text-white">{positionSizeLabel}</span>
        </div>

        <div className="ws-inset mt-3 p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
            <span>Size</span>
            <span className="tnum text-white/40">
              {sizeBaseUnits > 0 ? `≈ ${formatAmount(sizeBaseUnits)} ${assetSymbol}` : null}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={amountUsdc}
              onChange={decimalField(setAmountUsdc)}
              inputMode="decimal"
              placeholder="0"
              className="tnum w-full bg-transparent text-2xl text-white outline-none placeholder:text-white/30"
            />
            <span className="rounded-lg bg-white/8 px-2 py-1 text-[12px] font-semibold text-white/60">
              USDC
            </span>
          </div>
          {belowMinimumOrder ? (
            <p className="text-down mt-1.5 text-[11.5px] font-normal">
              Minimum position is ${MIN_ORDER_NOTIONAL_USDC} (amount × leverage).
            </p>
          ) : insufficientBalance ? (
            <p className="text-down mt-1.5 text-[11.5px] font-normal">Insufficient balance.</p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sizePercent}
            onChange={(e) => setSizePercent(Number(e.target.value))}
            disabled={maxUsdc <= 0}
            className="accent-accent h-1.5 flex-1 disabled:opacity-40"
          />
          <span className="ws-inset tnum flex w-16 items-center justify-center gap-0.5 py-1.5 text-[12.5px] text-white">
            {sizePercent}
            <span className="text-white/40">%</span>
          </span>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] font-normal text-white/70">
          <input
            type="checkbox"
            checked={showTriggers}
            onChange={(e) => setShowTriggers(e.target.checked)}
            className="accent-accent h-4 w-4 cursor-pointer rounded"
          />
          Take Profit / Stop Loss
        </label>

        {orderKind === "limit" ? (
          <div className="ws-inset mt-3 p-3">
            <div className="mb-1 text-xs font-normal text-white/55">Limit price</div>
            <input
              value={limitPrice}
              onChange={decimalField(setLimitPrice)}
              inputMode="decimal"
              placeholder={markPrice > 0 ? markPrice.toString() : "0"}
              className="tnum w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
          </div>
        ) : null}

        {showTriggers ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="ws-inset p-3">
              <div className="mb-1 text-xs font-normal text-white/55">Take profit</div>
              <input
                value={takeProfitPrice}
                onChange={decimalField(setTakeProfitPrice)}
                inputMode="decimal"
                placeholder="None"
                className="tnum w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>
            <div className="ws-inset p-3">
              <div className="mb-1 text-xs font-normal text-white/55">Stop loss</div>
              <input
                value={stopLossPrice}
                onChange={decimalField(setStopLossPrice)}
                inputMode="decimal"
                placeholder="None"
                className="tnum w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>
          </div>
        ) : null}

        <button
          onClick={() => void handleSubmit()}
          disabled={
            busy ||
            !walletReady ||
            !assetSymbol ||
            !size ||
            belowMinimumOrder ||
            (orderKind === "limit" && !limitPrice)
          }
          className={`mt-3 w-full cursor-pointer rounded-[14px] p-[15px] text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${
            side === "buy" ? "bg-up text-up-ink" : "bg-down text-down-ink"
          }`}
        >
          {busy ? (status?.text ?? "Placing order…") : "Place Order"}
        </button>

        <div className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-3 text-[12.5px] font-normal">
          <div className="flex justify-between">
            <span className="text-white/55">Order Value</span>
            <span className="tnum text-white">
              {orderValueUsdc > 0 ? formatUsd(orderValueUsdc) : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">Margin Required</span>
            <span className="tnum text-white">
              {marginRequiredUsdc > 0 ? formatUsd(marginRequiredUsdc) : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">Slippage</span>
            <span className="tnum text-white">Est: 0% / Max: 20%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">Fees</span>
            <span className="tnum text-white">
              {(PERPS_TAKER_FEE_RATE * 100).toFixed(2)}% / {(PERPS_TAKER_FEE_RATE * 100).toFixed(2)}
              %
            </span>
          </div>
          {notionalUsdc > 0 ? (
            <div className="flex justify-between text-white/40">
              <span>Est. fee this trade (open + close)</span>
              <span className="tnum">
                {/* Trading fees charge on notional, not on the margin posted. */}
                {formatUsd(openFee(notionalUsdc) + closeFee(notionalUsdc))}
              </span>
            </div>
          ) : null}
        </div>

        {status ? (
          <p
            className={`mt-3 text-xs font-normal ${
              status.kind === "error"
                ? "text-down"
                : status.kind === "success"
                  ? "text-up"
                  : "text-white/70"
            }`}
          >
            {status.text}
          </p>
        ) : null}
      </div>

      {/* Footer: Top up/Withdraw — pinned, always visible without scrolling
          even at a short viewport height. */}
      <div className="flex-none">
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
          <button
            onClick={() => setFundOpen(true)}
            disabled={!walletId || busy}
            className="bg-up text-up-ink cursor-pointer rounded-[14px] p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {walletId ? "Top up" : "Preparing…"}
          </button>
          <button
            onClick={() => setWithdrawOpen(true)}
            disabled={!walletId || busy || !withdrawable}
            className="cursor-pointer rounded-[14px] bg-white/10 p-3.5 font-sans text-[15px] font-semibold text-white transition-colors hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      </div>

      <HyperliquidFundModal
        open={fundOpen}
        onClose={() => setFundOpen(false)}
        walletId={walletId}
        onBridge={onBridge}
        onFunded={onFunded}
      />
      <HyperliquidWithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        walletId={walletId}
        availableUsdc={withdrawable ?? 0}
        onWithdraw={onWithdraw}
        onWithdrawn={onFunded}
      />
    </div>
  );
}
