"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { formatAmount } from "@/lib/trade/math";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  balance: number;
  symbol: string;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// USDC amount entry with the wallet balance and a max shortcut. Only accepts a
// well-formed decimal string so downstream base-unit conversion stays exact.
export function AmountInput({ value, onChange, balance, symbol }: AmountInputProps) {
  const over = Number(value) > balance;

  return (
    <div className="ws-inset p-[15px]">
      <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
        <span>Amount</span>
        <button
          onClick={() => onChange(String(balance))}
          className="cursor-pointer text-white/55 hover:text-white"
        >
          Balance {formatAmount(balance)} {symbol}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "" || DECIMAL_INPUT.test(next)) onChange(next);
          }}
          placeholder="0.00"
          className="ws-display tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
        />
        <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
          <AssetIcon sym={symbol} bg="#2775CA" size={22} />
          <span className="font-sans text-[13.5px] font-medium">{symbol}</span>
        </span>
      </div>
      {over ? (
        <div className="text-down mt-2 text-[12px] font-normal">
          That is more than your {symbol} balance.
        </div>
      ) : null}
    </div>
  );
}
