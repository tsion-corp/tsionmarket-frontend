"use client";

import { useState } from "react";
import { ArrowDownIcon } from "@/components/ui/icons";
import { useNgnRate } from "@/hooks/use-ngn-rate";

const DEFAULT_NGN = 250000;
const MAX_DIGITS = 12;

export function RampCard() {
  const { rate, live } = useNgnRate();
  const [ngn, setNgn] = useState(DEFAULT_NGN);
  const usd = ngn / rate;

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
    setNgn(digits ? parseInt(digits, 10) : 0);
  };

  return (
    <div className="rounded-[24px] border border-white/12 bg-white/5 p-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.8)] backdrop-blur-[16px]">
      <div className="mb-4 flex items-center justify-between">
        <span className="ws-serif text-[20px]">Add funds</span>
        <span className="flex items-center gap-1.5 text-xs font-normal text-white/60">
          {live ? (
            <>
              <span className="bg-up h-1.5 w-1.5 rounded-full" />
              Live rate
            </>
          ) : (
            "≈ 1 sec"
          )}
        </span>
      </div>
      <label className="block cursor-text rounded-2xl border border-white/8 bg-black/30 p-4 transition-colors focus-within:border-white/20">
        <span className="mb-2 flex justify-between text-xs font-normal text-white/60">
          <span>From your bank</span>
          <span>Naira</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span className="bg-accent/14 text-accent grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-sm font-semibold">
            ₦
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={ngn ? ngn.toLocaleString() : ""}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="250,000"
            aria-label="Amount in Naira"
            className="ws-serif tnum w-full min-w-0 border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
        </span>
      </label>
      <div className="my-2.5 flex justify-center">
        <span className="text-accent grid h-[34px] w-[34px] place-items-center rounded-full border border-white/14 bg-white/8">
          <ArrowDownIcon />
        </span>
      </div>
      <div className="border-accent/22 bg-accent/6 rounded-2xl border p-4">
        <div className="mb-2 flex justify-between text-xs font-normal text-white/60">
          <span>Available to invest</span>
          <span>USD</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="bg-accent/16 text-accent grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-sm font-semibold">
            $
          </span>
          <span className="ws-serif tnum text-accent min-w-0 truncate text-[28px]">
            {usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-normal text-white/45">
        ₦{Math.round(rate).toLocaleString()} per $1
        {live ? ", updated through the day" : ""}
      </p>
    </div>
  );
}
