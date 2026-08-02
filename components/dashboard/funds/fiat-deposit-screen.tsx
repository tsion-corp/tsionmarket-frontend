"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFundWallet, usePrivy } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const DIGITS = /^\d*$/;
const MIN_USD = 2;
const PRESETS = ["20", "50", "100"] as const;

interface FiatDepositScreenProps {
  onBack: () => void;
}

// Card and bank on-ramp through Privy's funding flow: the amount entered here
// becomes USDC on Base in the user's embedded wallet. Privy's own modal takes
// over for payment (card, Apple Pay, Google Pay — whatever the dashboard has
// enabled) and reports the outcome back.
export function FiatDepositScreen({ onBack }: FiatDepositScreenProps) {
  const t = useTranslations("fundsFlow");
  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const portfolio = usePortfolio();
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);

  const address = getWalletAddress(user, "ethereum");
  const amountNum = parseInt(amount || "0", 10);
  const canFund = address != null && amountNum >= MIN_USD && !busy;

  const startFunding = async () => {
    if (!canFund || !address) return;
    setBusy(true);
    try {
      const result = await fundWallet({
        address,
        options: { chain: base, amount, asset: "USDC" },
      });
      if (result.status === "completed") {
        toast.success(t("fiatSuccess"));
        void portfolio.refetch();
      }
    } catch (e) {
      toast.error(friendlyError(e, t("fiatFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SheetNav title={t("fiatDepositTitle")} subtitle={t("fiatDepositSubtitle")} onBack={onBack} />

      <div className="ws-inset p-[15px]">
        <div className="mb-[9px] text-xs font-normal text-white/55">{t("youPay")}</div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || DIGITS.test(next)) setAmount(next);
            }}
            placeholder="0"
            className="ws-display tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="font-sans text-[15px] font-medium text-white/70">USD</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(p)}
            className={`flex-1 cursor-pointer rounded-[13px] border px-3 py-2.5 font-sans text-[14px] font-medium transition-colors ${
              amount === p
                ? "border-white/20 bg-white/10 text-white"
                : "border-white/8 bg-white/4 text-white/60 hover:text-white/85"
            }`}
          >
            ${p}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[12.5px] leading-[1.55] font-normal text-white/50">{t("fiatNote")}</p>

      <button
        onClick={() => void startFunding()}
        disabled={!canFund}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? t("fiatWorking")
          : amountNum >= MIN_USD
            ? t("fiatContinue", { amount: amountNum })
            : t("fiatMin", { min: MIN_USD })}
      </button>
    </div>
  );
}
