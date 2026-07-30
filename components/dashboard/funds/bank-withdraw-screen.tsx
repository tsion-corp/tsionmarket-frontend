"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { ComingSoon } from "@/components/dashboard/funds/coming-soon";

const DECIMAL_INPUT = /^\d*\.?\d*$/;

interface BankWithdrawScreenProps {
  onBack: () => void;
}

// Bank off-ramp. The form is real so users see the flow, but payouts stay
// disabled until MoonPay verification clears.
export function BankWithdrawScreen({ onBack }: BankWithdrawScreenProps) {
  const t = useTranslations("fundsFlow");
  const [amount, setAmount] = useState("");

  return (
    <div>
      <SheetNav
        title={t("withdrawToBankTitle")}
        subtitle={t("withdrawToBankSubtitle")}
        onBack={onBack}
      />

      <div className="ws-inset p-[15px]">
        <div className="mb-[9px] text-xs font-normal text-white/55">{t("youWithdraw")}</div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || DECIMAL_INPUT.test(next)) setAmount(next);
            }}
            placeholder="0.00"
            className="ws-display tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="font-sans text-[15px] font-medium text-white/70">USDC</span>
        </div>
      </div>

      <ComingSoon title={t("almostReady")}>{t("bankComingSoonBody")}</ComingSoon>

      <button
        disabled
        className="text-ink mt-4 w-full cursor-not-allowed rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold opacity-50"
      >
        {t("comingSoon")}
      </button>
    </div>
  );
}
