"use client";

import { useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { formatAmount, formatUsd, liquidationPrice, positionSize } from "@/lib/trade/math";
import { PERP_ASSETS, type TradeAsset } from "@/lib/trade/assets";
import type { ConfirmPayload, StatLine } from "@/components/dashboard/modal-types";

interface PerpsPanelProps {
  market: TradeAsset;
  onMarket: (asset: TradeAsset) => void;
  prices: Record<string, number>;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const LEVERAGE_MARKS = [1, 5, 10, 25, 50];

export function PerpsPanel({ market, onMarket, prices, onOpenConfirm }: PerpsPanelProps) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [collateral, setCollateral] = useState("");
  const [leverage, setLeverage] = useState(10);

  const long = side === "long";
  const mark = prices[market.symbol] ?? 0;
  const collateralNum = parseFloat(collateral) || 0;
  const size = positionSize(collateralNum, leverage);
  const liq = liquidationPrice(mark, leverage, side);
  const disabled = collateralNum <= 0 || mark <= 0;

  const handleCollateral = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setCollateral(next);
  };

  const open = () => {
    const lines: StatLine[] = [
      { k: "Market", v: `${market.symbol}-PERP` },
      { k: "Side", v: long ? "Long" : "Short", c: long ? "#7CE7B0" : "#F6A5A5" },
      { k: "Collateral", v: `${formatAmount(collateralNum)} USDC` },
      { k: "Position size", v: `${formatAmount(size)} USDC` },
      { k: "Leverage", v: `${leverage}x` },
      { k: "Entry price", v: formatUsd(mark) },
      { k: "Liq. price", v: formatUsd(liq), c: "#F6A5A5" },
    ];
    onOpenConfirm({
      eyebrow: "Review order",
      badgeSym: market.symbol,
      badgeBg: market.bg,
      title: `${long ? "Open long" : "Open short"} · ${market.symbol}-PERP`,
      sub: `${leverage}x · ${formatAmount(size)} USDC size`,
      lines,
      cta: long ? `Open long · ${market.symbol}` : `Open short · ${market.symbol}`,
      successTitle: "Order confirmed",
      successMsg: `Your ${side} ${market.symbol}-PERP order is confirmed. Execution routes to your chosen venue.`,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {PERP_ASSETS.map((m) => {
          const on = m.symbol === market.symbol;
          const price = prices[m.symbol] ?? 0;
          return (
            <button
              key={m.symbol}
              onClick={() => onMarket(m)}
              className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-2xl border p-3 text-left transition-colors ${
                on ? "border-accent/40 bg-accent/10" : "border-white/10 bg-white/4 hover:bg-white/6"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <AssetIcon sym={m.symbol} bg={m.bg} size={18} />
                <span className="font-sans text-[13px] font-semibold">{m.symbol}</span>
              </span>
              <span className="tnum text-xs font-normal text-white/55">
                {price > 0 ? formatUsd(price) : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("long")}
          className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
            long
              ? "border-up/40 bg-up/16 text-up border"
              : "border border-white/10 bg-white/4 text-white/55"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setSide("short")}
          className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
            !long
              ? "border-down/40 bg-down/14 text-down border"
              : "border border-white/10 bg-white/4 text-white/55"
          }`}
        >
          Short
        </button>
      </div>

      <div className="ws-inset p-4">
        <div className="mb-2 text-xs font-normal text-white/55">Collateral (USDC)</div>
        <input
          value={collateral}
          onChange={(e) => handleCollateral(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="ws-serif tnum w-full bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
        />
      </div>

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
          <span className="text-white/55">Entry price</span>
          <span className="tnum text-white">{formatUsd(mark)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/55">Est. liquidation</span>
          <span className="tnum text-down">{formatUsd(liq)}</span>
        </div>
      </div>

      <button
        onClick={open}
        disabled={disabled}
        className={`mt-1 w-full cursor-pointer rounded-[14px] p-[15px] font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
          long ? "bg-up text-up-ink" : "bg-down text-down-ink"
        }`}
      >
        {collateralNum <= 0
          ? "Enter collateral"
          : long
            ? `Open long · ${market.symbol}`
            : `Open short · ${market.symbol}`}
      </button>
    </div>
  );
}
