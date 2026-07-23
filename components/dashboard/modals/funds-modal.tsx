"use client";

import { useState } from "react";
import { MethodTile } from "@/components/dashboard/funds/method-tile";
import { CryptoDepositScreen } from "@/components/dashboard/funds/crypto-deposit-screen";
import { DirectDepositScreen } from "@/components/dashboard/funds/direct-deposit-screen";
import { FiatDepositScreen } from "@/components/dashboard/funds/fiat-deposit-screen";
import { SwapIcon, WalletIcon, CardIcon } from "@/components/ui/icons";

type Step = "chooser" | "crypto" | "direct" | "fiat";

export function FundsModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("chooser");
  const back = () => setStep("chooser");

  if (step === "crypto") return <CryptoDepositScreen onBack={back} />;
  if (step === "direct") return <DirectDepositScreen onBack={back} />;
  if (step === "fiat") return <FiatDepositScreen onBack={back} />;

  return (
    <div>
      <div className="ws-serif text-[24px] tracking-[-0.01em]">Add funds</div>
      <p className="mt-2 text-[13.5px] leading-[1.5] font-normal text-white/65">
        Choose how you want to fund your wallet.
      </p>
      <div className="mt-[18px] flex flex-col gap-2">
        <MethodTile
          icon={<SwapIcon size={22} />}
          title="Deposit crypto"
          subtitle="Any token, any chain. Arrives as USDC."
          badge="Popular"
          onClick={() => setStep("crypto")}
        />
        <MethodTile
          icon={<WalletIcon size={22} />}
          title="Direct deposit"
          subtitle="Send USDC straight to your wallet."
          onClick={() => setStep("direct")}
        />
        <MethodTile
          icon={<CardIcon size={22} />}
          title="Card or bank"
          subtitle="Fund in naira with a card or transfer."
          badge="Soon"
          onClick={() => setStep("fiat")}
        />
      </div>
      <button
        onClick={onClose}
        className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
      >
        Close
      </button>
    </div>
  );
}
