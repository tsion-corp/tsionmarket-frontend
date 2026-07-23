"use client";

import { useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";

export function SendModal({ onConfirm }: { onConfirm: () => void }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const ready = to.trim().length > 0 && Number(amount) > 0;

  return (
    <div>
      <div className="ws-serif text-[24px] tracking-[-0.01em]">Send</div>
      <p className="mt-2 text-[13.5px] leading-[1.5] font-normal text-white/65">
        Send USDC to any wallet address on Base or Solana.
      </p>
      <div className="ws-inset mt-[18px] p-[15px]">
        <div className="mb-2 text-xs font-normal text-white/55">Recipient wallet</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Paste a wallet address"
          spellCheck={false}
          className="w-full border-none bg-transparent font-sans text-[15px] break-all text-white outline-none"
        />
      </div>
      <div className="ws-inset mt-3 p-[15px]">
        <div className="mb-[9px] text-xs font-normal text-white/55">Amount</div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)}
            className="ws-serif tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
            <AssetIcon sym="USDC" bg="#2775CA" size={22} />
            <span className="font-sans text-[13.5px] font-medium">USDC</span>
          </span>
        </div>
      </div>
      <button
        onClick={onConfirm}
        disabled={!ready}
        className={`mt-[18px] w-full rounded-[14px] p-3.5 font-sans text-[15px] font-semibold ${
          ready
            ? "text-ink cursor-pointer bg-white hover:opacity-90"
            : "cursor-not-allowed bg-white/10 text-white/40"
        }`}
      >
        Send USDC
      </button>
    </div>
  );
}
