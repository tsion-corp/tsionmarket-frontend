"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MethodTile } from "@/features/funds/components/method-tile";
import { track } from "@/lib/analytics/mixpanel";
import { CryptoWithdrawScreen } from "@/features/funds/components/crypto-withdraw-screen";
import { BankWithdrawScreen } from "@/features/funds/components/bank-withdraw-screen";
import { SwapIcon, BankIcon } from "@/components/ui/icons";
import { BANK_WITHDRAW_ENABLED } from "@/features/funds/lib/flags";

type Step = "chooser" | "crypto" | "bank";

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("withdrawModal");
  const [step, setStep] = useState<Step>("chooser");
  const back = () => setStep("chooser");

  // Reported once per open, at the top of the withdraw funnel.
  useEffect(() => {
    track("withdraw_opened");
  }, []);

  if (step === "crypto") return <CryptoWithdrawScreen onBack={back} />;
  if (step === "bank") return <BankWithdrawScreen onBack={back} />;

  return (
    <div>
      <div className="ws-display text-[24px] tracking-[-0.01em]">{t("title")}</div>
      <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">{t("subtitle")}</p>
      <div className="mt-[18px] flex flex-col gap-2">
        <MethodTile
          icon={<SwapIcon size={22} />}
          title={t("cryptoTitle")}
          subtitle={t("cryptoSubtitle")}
          badge={t("popular")}
          onClick={() => setStep("crypto")}
        />
        {BANK_WITHDRAW_ENABLED && (
          <MethodTile
            icon={<BankIcon size={22} />}
            title={t("bankTitle")}
            subtitle={t("bankSubtitle")}
            onClick={() => setStep("bank")}
          />
        )}
      </div>
    </div>
  );
}
