"use client";

import { useEffect, useState } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { AssetIcon } from "@/components/ui/asset-icon";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";
import { tokenBg } from "@/lib/trade/assets";
import { HyperliquidWalletPanel } from "@/features/trade/components/hyperliquid-wallet-panel";
import { HyperliquidChartPanel } from "@/features/trade/components/hyperliquid-chart-panel";
import { HyperliquidPositionsList } from "@/features/trade/components/hyperliquid-positions-list";
import { useHyperliquidTrading } from "@/features/trade/hooks/use-hyperliquid-trading";
import {
  isBridgeMinimumDetails,
  isInsufficientMarginDetails,
  isRestingOrder,
} from "@/features/trade/lib/hyperliquid-types";
import type {
  HlOrderSide,
  HlPositionView,
  HlTriggerKind,
} from "@/features/trade/lib/hyperliquid-types";
import type { GatewayApiError } from "@/lib/api/envelope";

// The curated market set for the simple view, in display order.
const SIMPLE_SYMBOLS = ["BTC", "ETH", "SOL"];
const DECIMAL_INPUT = /^\d*\.?\d*$/;
const LEVERAGE_MARKS = [2, 5, 10, 20];
// Hyperliquid rejects any order below this notional outright (error: "Order
// must have minimum value of $10") — checked client-side so it fails fast
// with a clear reason instead of round-tripping to Hyperliquid first.
const MIN_ORDER_NOTIONAL_USDC = 10;
type StatusKind = "info" | "success" | "error";
interface FormStatus {
  text: string;
  kind: StatusKind;
}

// The guided interface: pick a major market, long or short, a dollar amount
// and a leverage, one tap to trade. Market orders only; TP/SL, limit orders,
// and the full market list live in the pro interface. The entered dollars
// are COLLATERAL: the position's notional is amount × leverage, converted to
// the base-unit size Hyperliquid's API wants (amount × leverage / markPrice)
// — matching how the old Avantis simple view worked. Hyperliquid's own model
// has leverage only changing required margin, not order size, which is why
// the multiplication happens here and the leverage update is pushed to the
// account right before the order (always cross in this view — the margin
// mode control lives in the pro ticket only).
export function HyperliquidSimplePerps() {
  const trading = useHyperliquidTrading();
  const [selected, setSelected] = useState(SIMPLE_SYMBOLS[1]);
  const [side, setSide] = useState<HlOrderSide>("buy");
  const [amountUsd, setAmountUsd] = useState("");
  const [leverage, setLeverage] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus | null>(null);
  const portfolio = usePortfolio();

  // A top-up or withdrawal moves the user's main (spot) balance too — refresh
  // it the moment the perps side confirms, instead of leaving it to catch up
  // on its own ~20s poll.
  const handleWalletChanged = () => {
    trading.refetchAll();
    void portfolio.refetchFresh();
  };

  // Clears itself a few seconds after the action actually finishes — never
  // while `busy` (that would wipe the live "bridging…" progress text
  // mid-flight), only once a final success/error message is showing.
  useEffect(() => {
    if (!status || busy) return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status, busy]);

  if (!trading.authenticated) {
    return (
      <div className="ws-card p-6 text-sm font-normal text-white/55">Sign in to trade perps.</div>
    );
  }

  const asset = trading.assets.find((a) => a.symbol === selected) ?? null;
  const price = asset ? Number(trading.prices[asset.symbol] ?? 0) : 0;
  const maxLeverage = asset?.maxLeverage ?? 20;
  const clampedLeverage = Math.min(leverage, maxLeverage);

  const amountNum = Number(amountUsd) || 0;
  // The entered dollars are COLLATERAL, leverage multiplies them into
  // notional (the button literally promises "Long BTC 10x") — sizing at
  // amount/price alone opened 1x positions while displaying the chosen
  // leverage, the 1 Sept test's "leverage not applied" finding. Floored to
  // the asset's own size precision so the wire size never exceeds what the
  // collateral actually covers.
  const szDecimals = asset?.szDecimals ?? 8;
  const rawSize = price > 0 ? (amountNum * clampedLeverage) / price : 0;
  const sizeScale = 10 ** Math.max(0, Math.min(8, szDecimals));
  const size = Math.floor(rawSize * sizeScale) / sizeScale;
  const notionalUsd = amountNum * clampedLeverage;
  const belowMinimumOrder = notionalUsd > 0 && notionalUsd < MIN_ORDER_NOTIONAL_USDC;

  const canSubmit =
    Boolean(asset) &&
    price > 0 &&
    amountNum > 0 &&
    size > 0 &&
    !belowMinimumOrder &&
    trading.walletId != null &&
    !busy;

  const submit = async () => {
    if (!canSubmit || !asset) return;
    setStatus({ text: "Placing order…", kind: "info" });
    setBusy(true);
    try {
      // Snapshot before the order so the background poll after submit can
      // tell the fill landed (new position, or an existing one grown) and
      // surface it immediately instead of waiting for the next refetch.
      const before = JSON.stringify(trading.positions.map((p) => [p.id, p.size]).sort());
      await trading.actions.updateLeverage(asset.symbol, clampedLeverage, "cross");
      await trading.actions.placeOrder(
        { assetSymbol: asset.symbol, side, size: String(size) },
        (text) => setStatus({ text, kind: "info" })
      );
      void trading.waitForPositionsChange(
        (rows) => JSON.stringify(rows.map((p) => [p.id, p.size]).sort()) !== before
      );
      setStatus({
        text: `${side === "buy" ? "Long" : "Short"} ${asset.symbol} opened.`,
        kind: "success",
      });
      setAmountUsd("");
      trading.refetchAll();
    } catch (error) {
      const details = (error as GatewayApiError)?.details;
      if (isInsufficientMarginDetails(details)) {
        // placeOrder already tries topping up the perps wallet automatically
        // and waits ~2 minutes for it to land before giving up — reaching
        // this means either that's still confirming (rare — retry in a
        // moment) or the balance genuinely doesn't cover it either.
        setStatus({
          text: `Still short on balance (have $${details.withdrawableUsdc}, need $${details.requiredUsdc}) after automatically topping up — top up your perps wallet above, or wait a moment and retry if you just funded it.`,
          kind: "error",
        });
      } else if (isBridgeMinimumDetails(details)) {
        setStatus({
          text: `Insufficient balance — minimum is $${details.minDepositUsdc} (you have $${details.arbitrumBalanceUsdc}). Top up above, then retry.`,
          kind: "error",
        });
      } else {
        setStatus({
          text: friendlyError(error, "Trade failed."),
          kind: "error",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  // Refetch happens whether the action succeeds or fails — a rejection
  // (e.g. "already filled or cancelled") still means Hyperliquid's own state
  // moved since the last fetch. Refetching only on success left a failed
  // close/edit showing the exact same stale, still-actionable row forever.
  const handleClosePosition = async (
    position: HlPositionView,
    siblingOrderIdsToCancel: string[]
  ) => {
    setBusy(true);
    try {
      await trading.actions.closePosition(position.id, siblingOrderIdsToCancel);
    } finally {
      trading.refetchAll();
      // See hyperliquid-pro-perps.tsx's handleClosePosition for why this
      // background poll exists — the immediate refetch above can still be a
      // couple of seconds ahead of Hyperliquid actually settling the close.
      void trading.waitForPositionsChange((rows) => rows.every((p) => p.id !== position.id));
      if (siblingOrderIdsToCancel.length > 0) {
        void trading.waitForOrdersChange((rows) =>
          rows
            .filter((o) => siblingOrderIdsToCancel.includes(o.id))
            .every((o) => !isRestingOrder(o))
        );
      }
      setBusy(false);
    }
  };

  const handleEditTrigger = async (
    position: HlPositionView,
    kind: HlTriggerKind,
    triggerPrice: string,
    existingOrderId: string | undefined
  ) => {
    setBusy(true);
    try {
      await trading.actions.updateTriggerOrder(position.id, kind, triggerPrice, existingOrderId);
    } finally {
      trading.refetchAll();
      setBusy(false);
    }
  };

  return (
    <div
      className="grid grid-cols-1 items-start gap-4 min-[980px]:grid-cols-[minmax(0,420px)_1fr]"
      data-sensitive="position"
    >
      <div className="ws-card p-4 sm:p-5">
        <div className="mb-3.5 flex gap-2">
          {SIMPLE_SYMBOLS.map((sym) => {
            const on = sym === selected;
            const p = Number(trading.prices[sym] ?? 0);
            return (
              <button
                key={sym}
                onClick={() => setSelected(sym)}
                className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-2xl border p-3 text-left transition-colors ${
                  on
                    ? "border-accent/40 bg-accent/10"
                    : "border-white/10 bg-white/4 hover:bg-white/6"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <AssetIcon sym={sym} bg={tokenBg(sym)} size={18} fallback="gradient" />
                  <span className="font-sans text-[13px] font-semibold">{sym}</span>
                </span>
                <span className="tnum text-xs font-normal text-white/55">
                  {p > 0 ? formatUsd(p) : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("buy")}
            className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
              side === "buy"
                ? "border-up/40 bg-up/16 text-up border"
                : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
            }`}
          >
            Long ↑
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
              side === "sell"
                ? "border-down/40 bg-down/14 text-down border"
                : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
            }`}
          >
            Short ↓
          </button>
        </div>

        <div className="ws-inset mt-3 p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
            <span>Position size</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              value={amountUsd}
              onChange={(e) => {
                const next = e.target.value.replace(/,/g, "");
                if (next === "" || DECIMAL_INPUT.test(next)) setAmountUsd(next);
              }}
              inputMode="decimal"
              placeholder="0"
              className="ws-display tnum min-w-0 flex-1 bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 font-sans text-sm font-medium text-white/70">USD</span>
          </div>
          {belowMinimumOrder ? (
            <p className="text-down mt-1.5 text-[11.5px] font-normal">
              Minimum order is ${MIN_ORDER_NOTIONAL_USDC} of position size (amount × leverage).
            </p>
          ) : null}
        </div>

        <div className="ws-inset mt-3 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-normal text-white/55">Leverage</span>
            <span className="text-accent font-sans text-sm font-semibold">{clampedLeverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={Math.min(maxLeverage, 50)}
            step={1}
            value={clampedLeverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="accent-accent h-1.5 w-full cursor-pointer"
          />
          <div className="mt-2 flex justify-between">
            {LEVERAGE_MARKS.filter((m) => m <= maxLeverage).map((m) => (
              <button
                key={m}
                onClick={() => setLeverage(m)}
                className="tnum cursor-pointer text-xs font-normal text-white/40 hover:text-white/70"
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        <div className="ws-inset mt-3 flex flex-col gap-2 p-4 text-[12.5px] font-normal">
          <div className="flex justify-between">
            <span className="text-white/55">Size</span>
            <span className="tnum text-white">
              {size > 0 ? `${formatAmount(size)} ${asset?.symbol ?? ""}` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">Mark price</span>
            <span className="tnum text-white">{price > 0 ? formatUsd(price) : "—"}</span>
          </div>
        </div>

        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className={`mt-3 w-full cursor-pointer rounded-[14px] p-[15px] font-sans text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${
            side === "buy" ? "bg-up text-up-ink" : "bg-down text-down-ink"
          }`}
        >
          {busy
            ? (status?.text ?? "Placing order…")
            : amountUsd === ""
              ? "Enter an amount"
              : `${side === "buy" ? "Long" : "Short"} ${selected} ${clampedLeverage}x`}
        </button>

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

      <div className="flex flex-col gap-4">
        <HyperliquidWalletPanel
          walletId={trading.walletId}
          walletLoading={trading.walletLoading}
          clearinghouse={trading.clearinghouse}
          clearinghouseLoading={trading.clearinghouseLoading}
          busy={busy}
          onBridge={() => trading.actions.bridge()}
          onWithdraw={(amountUsdc, onStatus) => trading.actions.withdraw(amountUsdc, onStatus)}
          onFunded={handleWalletChanged}
        />
        <HyperliquidChartPanel assetSymbol={asset?.symbol ?? ""} />
        <HyperliquidPositionsList
          positions={trading.positions}
          orders={trading.orders}
          loading={trading.positionsLoading}
          busy={busy}
          walletId={trading.walletId}
          onClosePosition={handleClosePosition}
          onEditTrigger={handleEditTrigger}
        />
      </div>
    </div>
  );
}
