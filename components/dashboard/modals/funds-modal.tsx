"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MethodTile } from "@/components/dashboard/funds/method-tile";
import { CryptoDepositScreen } from "@/components/dashboard/funds/crypto-deposit-screen";
import { BankTransferScreen } from "@/components/dashboard/funds/bank-transfer-screen";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ArrowRightIcon, BankIcon } from "@/components/ui/icons";
import type { DepositPrefill } from "@/lib/voice/intent";

type Step = "chooser" | "crypto" | "bank";

// USDC brand blue — only the fallback tint; AssetIcon renders the real
// TokenUSDC web3icon for "USDC".
const USDC_BLUE = "#2775CA";

// `deposit` is an optional voice prefill: when present the modal opens straight
// on the crypto screen with that chain/token pre-selected (the user still sees
// and confirms the address; nothing is sent).
export function FundsModal({
  onClose,
  deposit,
}: {
  onClose: () => void;
  deposit?: DepositPrefill;
}) {
  const t = useTranslations("funds");
  const [step, setStep] = useState<Step>(deposit ? "crypto" : "chooser");
  const back = () => setStep("chooser");

  if (step === "crypto") return <CryptoDepositScreen onBack={back} initialDeposit={deposit} />;
  if (step === "bank") return <BankTransferScreen onBack={back} onClose={onClose} />;

  return (
    <div>
      <div className="ws-display text-[24px] tracking-[-0.01em]">{t("title")}</div>
      <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">{t("subtitle")}</p>
      <div className="mt-[18px] flex flex-col gap-2">
        {/* Fund with crypto — a USDC-led row, since that's what deposits settle
            to. Any token on almost any chain arrives as USDC. */}
        <button
          onClick={() => setStep("crypto")}
          className="flex w-full cursor-pointer items-center gap-3.5 rounded-[16px] border border-white/8 bg-white/4 px-4 py-3.5 text-left transition-colors hover:bg-white/8"
        >
          <AssetIcon sym="USDC" bg={USDC_BLUE} size={42} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-sans text-[15px] font-semibold text-white">
                {t("cryptoTitle")}
              </span>
              <span className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-white/55 uppercase">
                {t("popular")}
              </span>
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-[1.4] font-normal text-white/55">
              {t("cryptoSubtitle")}
            </span>
          </span>
          <span className="text-white/35">
            <ArrowRightIcon size={16} />
          </span>
        </button>
        <MethodTile
          icon={<BankIcon size={22} />}
          title={t("bankTitle")}
          subtitle={t("bankSubtitle")}
          onClick={() => setStep("bank")}
        />
      </div>
      <button
        onClick={onClose}
        className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
      >
        {t("close")}
      </button>
    </div>
  );
}
