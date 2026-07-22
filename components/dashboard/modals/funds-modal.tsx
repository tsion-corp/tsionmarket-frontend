"use client";

import { useState } from "react";
import { BankIcon, CardIcon, CoinIcon } from "@/components/ui/icons";
import { FUND_METHODS } from "@/lib/data/dashboard";

const METHOD_ICONS: Record<string, React.ReactNode> = {
  bank: <BankIcon className="text-accent" />,
  card: <CardIcon className="text-accent" />,
  crypto: <CoinIcon size={18} className="text-accent" />,
};

interface FundsModalProps {
  subtitle?: string;
  onConfirm: () => void;
}

export function FundsModal({
  subtitle = "Top up in Naira and start investing in seconds.",
  onConfirm,
}: FundsModalProps) {
  const [method, setMethod] = useState("bank");
  return (
    <div>
      <div className="ws-serif text-[24px] tracking-[-0.01em]">Add funds</div>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-white/65">{subtitle}</p>
      <div className="ws-inset mt-[18px] p-4">
        <div className="mb-[9px] flex justify-between text-xs text-white/55">
          <span>Amount</span>
          <span>≈ 161 USDC</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="bg-accent/14 text-accent grid h-[34px] w-[34px] place-items-center rounded-[10px] text-[15px] font-semibold">
            ₦
          </span>
          <span className="ws-serif tnum text-[28px]">250,000</span>
        </div>
      </div>
      <div className="mt-3.5 flex flex-col gap-[9px]">
        {FUND_METHODS.map((m) => {
          const active = method === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-[13px] border p-3 font-sans transition-colors ${
                active ? "border-accent/45 bg-accent/12" : "border-white/10 bg-white/4"
              }`}
            >
              <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-white/10 bg-white/6">
                {METHOD_ICONS[m.key]}
              </span>
              <span className="flex-1 text-left">
                <span className="block text-sm font-medium text-white">{m.label}</span>
                <span className="block text-xs text-white/50">{m.desc}</span>
              </span>
              <span
                className={`grid h-5 w-5 place-items-center rounded-full ${
                  active
                    ? "bg-accent shadow-[inset_0_0_0_3px_#0c0c0e,0_0_0_1px_#A78BFA]"
                    : "border border-white/20"
                }`}
              />
            </button>
          );
        })}
      </div>
      <button
        onClick={onConfirm}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
      >
        Continue
      </button>
    </div>
  );
}
