"use client";

import { useState } from "react";
import { BankIcon, CardIcon } from "@/components/ui/icons";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { ComingSoon } from "@/components/dashboard/funds/coming-soon";

const DIGITS = /^\d*$/;

type Method = "card" | "bank";

interface FiatDepositScreenProps {
  onBack: () => void;
}

// Card and bank on-ramp. The screen is real so users see what is coming, but the
// rails are disabled until MoonPay verification clears.
export function FiatDepositScreen({ onBack }: FiatDepositScreenProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("card");

  const chip = (active: boolean) =>
    `flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[13px] border px-3 py-3 font-sans text-[14px] font-medium transition-colors ${
      active ? "border-white/20 bg-white/10 text-white" : "border-white/8 bg-white/4 text-white/60"
    }`;

  return (
    <div>
      <SheetNav
        title="Add with card or bank"
        subtitle="Fund your wallet in naira. Settles to USDC."
        onBack={onBack}
      />

      <div className="ws-inset p-[15px]">
        <div className="mb-[9px] text-xs font-normal text-white/55">You pay</div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || DIGITS.test(next)) setAmount(next);
            }}
            placeholder="0"
            className="ws-serif tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="font-sans text-[15px] font-medium text-white/70">NGN</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={() => setMethod("card")} className={chip(method === "card")}>
          <CardIcon size={18} />
          Card
        </button>
        <button onClick={() => setMethod("bank")} className={chip(method === "bank")}>
          <BankIcon size={18} />
          Bank transfer
        </button>
      </div>

      <ComingSoon title="Almost ready">
        We are finishing verification with our payments partner. Card and bank funding go live
        shortly. Deposit crypto in the meantime.
      </ComingSoon>

      <button
        disabled
        className="text-ink mt-4 w-full cursor-not-allowed rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold opacity-50"
      >
        Coming soon
      </button>
    </div>
  );
}
