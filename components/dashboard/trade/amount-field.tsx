"use client";

import { TokenSelect } from "@/components/dashboard/trade/token-select";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import type { TradeAsset } from "@/lib/trade/assets";

const DECIMAL_INPUT = /^\d*\.?\d*$/;

interface AmountFieldProps {
  label: string;
  amount: string;
  onAmountChange?: (value: string) => void;
  asset: TradeAsset;
  onAsset: (asset: TradeAsset) => void;
  prices: Record<string, number>;
  balances: Record<string, number>;
  excludeSymbol?: string;
  assets?: TradeAsset[];
  balance?: number;
  onMax?: () => void;
  usdValue: number;
  accent?: boolean;
  loading?: boolean;
}

export function AmountField({
  label,
  amount,
  onAmountChange,
  asset,
  onAsset,
  prices,
  balances,
  excludeSymbol,
  assets,
  balance,
  onMax,
  usdValue,
  accent,
  loading,
}: AmountFieldProps) {
  const readOnly = !onAmountChange;

  const handleChange = (raw: string) => {
    if (!onAmountChange) return;
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) onAmountChange(next);
  };

  return (
    <div className="ws-inset p-4">
      <div className="mb-2.5 flex items-center justify-between text-xs font-normal text-white/55">
        <span>{label}</span>
        {balance != null ? (
          <span className="flex items-center gap-2">
            <span className="tnum">
              Balance {formatAmount(balance)} {asset.symbol}
            </span>
            {onMax && balance > 0 ? (
              <button
                onClick={onMax}
                className="text-accent cursor-pointer font-medium hover:opacity-80"
              >
                Max
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        {readOnly ? (
          <span
            className={`ws-serif tnum min-w-0 flex-1 truncate text-[32px] ${
              accent ? "text-accent" : ""
            } ${loading ? "opacity-50" : ""}`}
          >
            {amount === "" ? "0" : formatAmount(parseFloat(amount) || 0)}
          </span>
        ) : (
          <input
            value={amount}
            onChange={(e) => handleChange(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className={`ws-serif tnum min-w-0 flex-1 bg-transparent text-[32px] outline-none placeholder:text-white/30 ${
              accent ? "text-accent" : "text-white"
            }`}
          />
        )}
        <TokenSelect
          value={asset}
          onChange={onAsset}
          prices={prices}
          balances={balances}
          excludeSymbol={excludeSymbol}
          assets={assets}
        />
      </div>

      <div className="tnum mt-2 text-xs font-normal text-white/40">{formatUsd(usdValue)}</div>
    </div>
  );
}
