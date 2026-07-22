"use client";

import { useState } from "react";

export function SendModal({ onConfirm }: { onConfirm: () => void }) {
  const [to, setTo] = useState("tobi@email.com");
  return (
    <div>
      <div className="ws-serif text-[24px] tracking-[-0.01em]">Send</div>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-white/65">
        Transfer to any World Street user or wallet. It settles instantly.
      </p>
      <div className="ws-inset mt-[18px] p-[15px]">
        <div className="mb-2 text-xs text-white/55">To</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Email, username or wallet"
          className="w-full border-none bg-transparent text-[15px] text-white outline-none"
        />
      </div>
      <div className="ws-inset mt-3 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs text-white/55">
          <span>Amount</span>
          <span>Balance 8,106 USDC</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="ws-serif tnum text-[28px]">500.00</span>
          <span className="inline-flex items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#2775CA] text-[11px] font-bold">
              $
            </span>
            <span className="font-sans text-[13.5px] font-medium">USDC</span>
          </span>
        </div>
      </div>
      <button
        onClick={onConfirm}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        Send 500 USDC
      </button>
    </div>
  );
}
