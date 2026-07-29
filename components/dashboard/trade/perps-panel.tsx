"use client";

import { useState } from "react";
import { formatAmount, formatUsd, liquidationPrice, openFee, positionSize } from "@/lib/trade/math";
import type { TradeAsset } from "@/lib/trade/assets";

interface PerpsPanelProps {
  market: TradeAsset;
  prices: Record<string, number>;
  balances: Record<string, number>;
}

type OrderType = "market" | "limit";

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const LEVERAGE_MARKS = [1, 5, 10, 25, 50];
const ORDER_TYPES: OrderType[] = ["market", "limit"];

export function PerpsPanel({ market, prices, balances }: PerpsPanelProps) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [collateral, setCollateral] = useState("");
  const [leverage, setLeverage] = useState(10);
  // Null tracks the live mark; a string is a user-set trigger price.
  const [triggerOverride, setTriggerOverride] = useState<string | null>(null);

  const long = side === "long";
  const isLimit = orderType === "limit";
  const mark = prices[market.symbol] ?? 0;

  // Reset the trigger to the market on a market switch, during render, so it
  // follows the new mark without an effect.
  const [seenMarket, setSeenMarket] = useState(market.symbol);
  if (seenMarket !== market.symbol) {
    setSeenMarket(market.symbol);
    setTriggerOverride(null);
  }

  const trigger = triggerOverride ?? (mark > 0 ? formatAmount(mark) : "");
  // A market order enters at the mark; a limit order at its trigger price.
  const entry = isLimit ? parseFloat(trigger) || 0 : mark;

  const collateralNum = parseFloat(collateral) || 0;
  const usdcBalance = balances["USDC"] ?? 0;
  const size = positionSize(collateralNum, leverage);
  const liq = liquidationPrice(entry, leverage, side);
  const fee = openFee(size);

  const handleCollateral = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setCollateral(next);
  };
  const handleTrigger = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setTriggerOverride(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("long")}
          className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
            long
              ? "border-up/40 bg-up/16 text-up border"
              : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setSide("short")}
          className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
            !long
              ? "border-down/40 bg-down/14 text-down border"
              : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
          }`}
        >
          Short
        </button>
      </div>

      <div className="ws-inset grid grid-cols-2 gap-1 p-1">
        {ORDER_TYPES.map((t) => {
          const on = t === orderType;
          return (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`cursor-pointer rounded-xl py-2 font-sans text-[13px] font-medium capitalize transition-colors ${
                on
                  ? "bg-accent/16 shadow-[inset_0_0_0_1px_rgba(255, 255, 255, 0.35)] text-white"
                  : "text-white/55 hover:text-white/80"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="ws-inset p-4">
        <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
          <span>You&apos;re paying</span>
          <span className="flex items-center gap-2">
            <span className="tnum">Balance {formatAmount(usdcBalance)} USDC</span>
            {usdcBalance > 0 ? (
              <button
                onClick={() => setCollateral(String(usdcBalance))}
                className="text-accent cursor-pointer font-medium hover:opacity-80"
              >
                Max
              </button>
            ) : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            value={collateral}
            onChange={(e) => handleCollateral(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="ws-display tnum min-w-0 flex-1 bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
          />
          <span className="shrink-0 font-sans text-sm font-medium text-white/70">USDC</span>
        </div>
        <div className="tnum mt-2 text-xs font-normal text-white/40">
          {formatUsd(collateralNum)}
        </div>
      </div>

      {isLimit ? (
        <div className="ws-inset p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
            <span>Trigger price</span>
            <button
              onClick={() => setTriggerOverride(null)}
              className="text-accent cursor-pointer font-medium hover:opacity-80"
            >
              Use market
            </button>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <input
              value={trigger}
              onChange={(e) => handleTrigger(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="ws-display tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 text-[13px] font-normal text-white/55">USD</span>
          </div>
          <div className="tnum mt-2 text-xs font-normal text-white/40">
            Mark {mark > 0 ? formatUsd(mark) : "—"}
          </div>
        </div>
      ) : null}

      <div className="ws-inset p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-normal text-white/55">Leverage</span>
          <span className="text-accent font-sans text-sm font-semibold">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="accent-accent h-1.5 w-full cursor-pointer"
        />
        <div className="mt-2 flex justify-between">
          {LEVERAGE_MARKS.map((m) => (
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

      <div className="ws-inset flex flex-col gap-2 p-4 text-[12.5px] font-normal">
        <div className="flex justify-between">
          <span className="text-white/55">Position size</span>
          <span className="tnum text-white">{formatAmount(size)} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/55">{isLimit ? "Trigger price" : "Entry price"}</span>
          <span className="tnum text-white">{formatUsd(entry)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/55">Est. liquidation</span>
          <span className="tnum text-down">{formatUsd(liq)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/55">Est. open fee</span>
          <span className="tnum text-white">{formatUsd(fee)}</span>
        </div>
      </div>

      <button
        disabled
        className={`mt-1 w-full cursor-not-allowed rounded-[14px] p-[15px] font-sans text-[15px] font-semibold opacity-50 ${
          long ? "bg-up text-up-ink" : "bg-down text-down-ink"
        }`}
      >
        Coming soon
      </button>
      <p className="text-center text-xs font-normal text-white/45">
        Perps are coming soon. The size, entry, liquidation, and fee figures above are a live
        preview.
      </p>
    </div>
  );
}
