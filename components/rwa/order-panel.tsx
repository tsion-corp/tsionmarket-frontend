"use client";

import { CoinBadge } from "@/components/ui/coin-badge";
import { ArrowDownIcon } from "@/components/ui/icons";
import { quoteOrder, type OrderMode } from "@/lib/rwa-order";
import type { RwaAsset } from "@/lib/types";

interface OrderPanelProps {
  asset: RwaAsset;
  mode: OrderMode;
  onModeChange: (mode: OrderMode) => void;
  onOrder: () => void;
}

export function OrderPanel({ asset, mode, onModeChange, onOrder }: OrderPanelProps) {
  const quote = quoteOrder(asset, mode);
  const isBuy = mode === "buy";
  return (
    <div className="ws-card p-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.85)] min-[960px]:sticky min-[960px]:top-[88px]">
      <div className="ws-inset mb-4 grid grid-cols-2 gap-1.5 rounded-[14px] p-[5px]">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`cursor-pointer rounded-[10px] p-2.5 font-sans text-sm font-semibold capitalize transition-colors ${
              mode === m
                ? "bg-accent/18 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
                : "bg-transparent text-white/55 hover:text-white"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="ws-inset p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs text-white/55">
          <span>{quote.payLabel}</span>
          <span>{quote.payBalance}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="ws-serif tnum text-[30px]">{quote.payAmt}</span>
          <span className="inline-flex items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
            <CoinBadge sym={quote.paySym} bg={quote.payBg} size={22} />
            <span className="font-sans text-[13.5px] font-medium">{quote.payTicker}</span>
          </span>
        </div>
      </div>

      <div className="-my-2 flex justify-center">
        <span className="bg-panel text-accent z-[1] grid h-8 w-8 place-items-center rounded-[9px] border border-white/14">
          <ArrowDownIcon size={15} />
        </span>
      </div>

      <div className="ws-inset p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs text-white/55">
          <span>You receive</span>
          <span>
            1 {asset.ticker} = {asset.price}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="ws-serif tnum text-accent text-[30px]">{quote.getAmt}</span>
          <span className="inline-flex items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
            <CoinBadge sym={quote.getSym} bg={quote.getBg} size={22} />
            <span className="font-sans text-[13.5px] font-medium">{quote.getTicker}</span>
          </span>
        </div>
      </div>

      <button
        onClick={onOrder}
        className={`mt-4 w-full cursor-pointer rounded-[14px] p-[15px] font-sans text-[15px] font-semibold whitespace-nowrap hover:opacity-90 ${
          isBuy ? "text-ink bg-white" : "bg-down text-down-ink"
        }`}
      >
        {isBuy ? "Buy" : "Sell"} {asset.ticker}
      </button>

      <div className="mt-[15px] flex flex-col gap-[9px] text-[12.5px] text-white/60">
        <div className="flex justify-between">
          <span>Est. price</span>
          <span className="text-white/85">{asset.price}</span>
        </div>
        <div className="flex justify-between">
          <span>Fee</span>
          <span className="text-up">$0.00 · no commission</span>
        </div>
        <div className="flex justify-between">
          <span>Settlement</span>
          <span className="text-white/85">Instant · 24/7</span>
        </div>
        <div className="flex justify-between">
          <span>Redeem to</span>
          <span className="text-white/85">USDC or ₦ Naira</span>
        </div>
      </div>
    </div>
  );
}
