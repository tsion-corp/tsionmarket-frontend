"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MethodTile } from "@/features/funds/components/method-tile";
import { CryptoDepositScreen } from "@/features/funds/components/crypto-deposit-screen";
import { BankTransferScreen } from "@/features/funds/components/bank-transfer-screen";
import { BuyKashNairaScreen } from "@/features/funds/components/buy-kash-naira-screen";
import { AddWskScreen } from "@/features/funds/components/add-wsk-screen";
import { useModalScreen } from "@/components/ui/modal-shell";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ArrowRightIcon, BankIcon } from "@/components/ui/icons";
import type { DepositPrefill } from "@/lib/voice/intent";

type Step = "chooser" | "crypto" | "bank" | "kash" | "wsk" | "naira";

// USDC brand blue — only the fallback tint; AssetIcon renders the platform's
// own USDC coin for "USDC".
const USDC_BLUE = "#2775CA";

// `deposit` is an optional voice prefill: when present the modal opens straight
// on the crypto screen with that chain/token pre-selected (the user still sees
// and confirms the address; nothing is sent).
export function FundsModal({
  onClose,
  deposit,
  startAt,
}: {
  onClose: () => void;
  deposit?: DepositPrefill;
  /** Open on the ways to add Kash, for the Kash card's own button. */
  startAt?: "kash";
}) {
  const t = useTranslations("funds");
  const [step, setStep] = useState<Step>(deposit ? "crypto" : (startAt ?? "chooser"));
  // Back from a Kash screen goes to the Kash options when that is where it started.
  const back = () => setStep("chooser");
  const backToKash = () => setStep("kash");

  if (step === "crypto") return <CryptoDepositScreen onBack={back} initialDeposit={deposit} />;
  if (step === "bank") return <BankTransferScreen onBack={back} onClose={onClose} />;
  if (step === "kash") {
    return <KashOptions onBack={startAt ? undefined : back} onChoose={setStep} />;
  }
  if (step === "naira") return <BuyKashNairaScreen onBack={backToKash} />;
  if (step === "wsk") return <AddWskScreen onBack={backToKash} />;

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
        {/* Not translated yet: it is new, and the locale files follow with the rest of the
            wallet upgrade's copy. */}
        <MethodTile
          icon={<span className="text-[11px] font-bold tracking-wide">Kash</span>}
          title="Add Kash"
          subtitle="With USDC from a wallet of your own, or with naira."
          onClick={() => setStep("kash")}
        />
      </div>
      {/* <button
        onClick={onClose}
        className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
      >
        {t("close")}
      </button> */}
    </div>
  );
}

// The ways to add Kash, one choice each: USDC on Arbitrum from the person's own wallet, or naira
// by bank transfer. Opened from the Add funds sheet, or straight from the Kash card.
function KashOptions({
  onBack,
  onChoose,
}: {
  onBack?: () => void;
  onChoose: (step: Step) => void;
}) {
  useModalScreen({ back: onBack });
  return (
    <div>
      <div className="ws-display text-[24px] tracking-[-0.01em]">Add Kash</div>
      <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">
        One Kash is one dollar. Choose how you want to pay.
      </p>
      <div className="mt-[18px] flex flex-col gap-2">
        <MethodTile
          icon={<AssetIcon sym="USDC" bg={USDC_BLUE} size={42} />}
          title="Pay with USDC"
          subtitle="USDC on Arbitrum, from your own wallet such as MetaMask."
          onClick={() => onChoose("wsk")}
        />
        <MethodTile
          icon={<span className="text-[15px] font-bold">₦</span>}
          title="Pay with naira"
          subtitle="Bank transfer in naira. The Kash is added automatically."
          onClick={() => onChoose("naira")}
        />
      </div>
    </div>
  );
}
