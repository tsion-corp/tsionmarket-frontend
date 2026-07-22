"use client";

import { CoinBadge } from "@/components/ui/coin-badge";
import { quoteOrder, type OrderMode } from "@/lib/rwa-order";
import type { RwaAsset } from "@/lib/types";

interface OrderReviewModalProps {
  asset: RwaAsset;
  mode: OrderMode;
  onConfirm: () => void;
}

export function OrderReviewModal({ asset, mode, onConfirm }: OrderReviewModalProps) {
  const quote = quoteOrder(asset, mode);
  const side = mode === "buy" ? "Buy" : "Sell";
  return (
    <div>
      <div className="text-[13px] font-normal text-white/55">{"// Review order"}</div>
      <div className="mt-3.5 flex items-center gap-[13px]">
        <CoinBadge sym={asset.sym} bg={asset.bg} size={52} />
        <div>
          <div className="ws-serif text-[23px] tracking-[-0.01em]">
            {side} {asset.name}
          </div>
          <div className="text-[12.5px] text-white/50">
            {asset.ticker} · {asset.cat}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 text-[13.5px] text-white/60">
        <div className="flex justify-between">
          <span>{quote.payLabel}</span>
          <span className="text-white">
            {quote.payAmt} {quote.payTicker}
          </span>
        </div>
        <div className="flex justify-between">
          <span>You receive</span>
          <span className="text-accent">
            {quote.getAmt} {quote.getTicker}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Est. price</span>
          <span className="text-white">{asset.price}</span>
        </div>
        <div className="flex justify-between">
          <span>Fee</span>
          <span className="text-up">$0.00 · no commission</span>
        </div>
        <div className="flex justify-between">
          <span>Settlement</span>
          <span className="text-white">Instant · 24/7</span>
        </div>
      </div>
      <button
        onClick={onConfirm}
        className={`mt-5 w-full cursor-pointer rounded-[14px] p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 ${
          mode === "buy" ? "text-ink bg-white" : "bg-down text-down-ink"
        }`}
      >
        Confirm {side}
      </button>
    </div>
  );
}
