"use client";

import { useState } from "react";
import { AmountField } from "@/components/dashboard/trade/amount-field";
import { TokenSelect } from "@/components/dashboard/trade/token-select";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import type { TradeAsset } from "@/lib/trade/assets";
import type { ConfirmPayload, StatLine } from "@/components/dashboard/modal-types";

interface LimitPanelProps {
  pay: TradeAsset;
  receive: TradeAsset;
  onPay: (asset: TradeAsset) => void;
  onReceive: (asset: TradeAsset) => void;
  onFlip: () => void;
  prices: Record<string, number>;
  balances: Record<string, number>;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const ADJUSTMENTS = [-5, -1, 1, 5];
const EXPIRIES = ["1 day", "7 days", "30 days"];

export function LimitPanel({
  pay,
  receive,
  onPay,
  onReceive,
  onFlip,
  prices,
  balances,
  onOpenConfirm,
}: LimitPanelProps) {
  const [amount, setAmount] = useState("");
  // Null means the field tracks the live market rate. A string is a user edit.
  const [override, setOverride] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(EXPIRIES[1]);

  const payPrice = prices[pay.symbol] ?? 0;
  const receivePrice = prices[receive.symbol] ?? 0;
  // Market rate expressed as pay-asset units per one receive-asset unit.
  const marketRate = payPrice > 0 && receivePrice > 0 ? receivePrice / payPrice : 0;

  // Reset the user edit when the pair changes, during render, so the field
  // falls back to the new market rate without an effect.
  const pairKey = `${pay.symbol}/${receive.symbol}`;
  const [seenPair, setSeenPair] = useState(pairKey);
  if (seenPair !== pairKey) {
    setSeenPair(pairKey);
    setOverride(null);
  }

  const limit = override ?? (marketRate > 0 ? formatAmount(marketRate) : "");
  const amountNum = parseFloat(amount) || 0;
  const limitNum = parseFloat(limit) || 0;
  const receiveAmount = limitNum > 0 ? amountNum / limitNum : 0;
  const payBalance = balances[pay.symbol] ?? 0;
  const fromMarket = marketRate > 0 && limitNum > 0 ? (limitNum / marketRate - 1) * 100 : 0;
  const insufficient = payBalance > 0 && amountNum > payBalance;
  const disabled = amountNum <= 0 || limitNum <= 0 || insufficient;

  const handleLimit = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setOverride(next);
  };

  const adjust = (pct: number) => setOverride(formatAmount(marketRate * (1 + pct / 100)));

  const place = () => {
    const lines: StatLine[] = [
      { k: "You pay", v: `${formatAmount(amountNum)} ${pay.symbol}` },
      { k: "You receive", v: `${formatAmount(receiveAmount)} ${receive.symbol}`, c: "#A78BFA" },
      { k: "Limit price", v: `1 ${receive.symbol} = ${formatAmount(limitNum)} ${pay.symbol}` },
      { k: "From market", v: `${fromMarket >= 0 ? "+" : ""}${fromMarket.toFixed(2)}%` },
      { k: "Expires", v: expiry },
    ];
    onOpenConfirm({
      eyebrow: "Review limit order",
      badgeSym: receive.symbol,
      badgeBg: receive.bg,
      title: `Limit buy ${receive.symbol}`,
      sub: `Fills at ${formatAmount(limitNum)} ${pay.symbol} or better`,
      lines,
      cta: "Place limit order",
      successTitle: "Limit order placed",
      successMsg: `Your order to buy ${receive.symbol} at ${formatAmount(limitNum)} ${pay.symbol} is working.`,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <AmountField
        label="You pay"
        amount={amount}
        onAmountChange={setAmount}
        asset={pay}
        onAsset={onPay}
        prices={prices}
        balances={balances}
        excludeSymbol={receive.symbol}
        balance={payBalance}
        onMax={() => setAmount(String(payBalance))}
        usdValue={amountNum * payPrice}
      />

      <div className="ws-inset p-4">
        <div className="mb-2.5 flex items-center justify-between text-xs font-normal text-white/55">
          <span>Limit price</span>
          <button
            onClick={onFlip}
            className="text-accent cursor-pointer font-medium hover:opacity-80"
          >
            Flip
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <input
            value={limit}
            onChange={(e) => handleLimit(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="ws-serif tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="shrink-0 text-[13px] font-normal text-white/55">
            {pay.symbol} per {receive.symbol}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-normal text-white/40">
            Market {marketRate > 0 ? formatAmount(marketRate) : "—"}
          </span>
          <span
            className="tnum text-xs font-medium"
            style={{ color: fromMarket >= 0 ? "#7CE7B0" : "#F6A5A5" }}
          >
            {marketRate > 0 && limitNum > 0
              ? `${fromMarket >= 0 ? "+" : ""}${fromMarket.toFixed(2)}% vs market`
              : ""}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          <button
            onClick={() => setOverride(null)}
            className="flex-1 cursor-pointer rounded-lg bg-white/6 py-1.5 font-sans text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
          >
            Market
          </button>
          {ADJUSTMENTS.map((pct) => (
            <button
              key={pct}
              onClick={() => adjust(pct)}
              className="flex-1 cursor-pointer rounded-lg bg-white/6 py-1.5 font-sans text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
            >
              {pct > 0 ? `+${pct}%` : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="ws-inset p-4">
        <div className="mb-2 text-xs font-normal text-white/55">You receive (estimated)</div>
        <div className="flex items-center justify-between gap-3">
          <span className="ws-serif tnum text-accent min-w-0 flex-1 truncate text-[26px]">
            {formatAmount(receiveAmount)}
          </span>
          <TokenSelect
            value={receive}
            onChange={onReceive}
            prices={prices}
            balances={balances}
            excludeSymbol={pay.symbol}
          />
        </div>
        <div className="tnum mt-2 text-xs font-normal text-white/40">
          {formatUsd(receiveAmount * receivePrice)}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-normal text-white/45">Expires in</span>
        <div className="flex gap-1">
          {EXPIRIES.map((e) => (
            <button
              key={e}
              onClick={() => setExpiry(e)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
                expiry === e ? "bg-accent/16 text-white" : "text-white/45 hover:text-white"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={place}
        disabled={disabled}
        className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-[15px] font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {insufficient
          ? `Not enough ${pay.symbol}`
          : amountNum <= 0
            ? "Enter an amount"
            : "Place limit order"}
      </button>
    </div>
  );
}
