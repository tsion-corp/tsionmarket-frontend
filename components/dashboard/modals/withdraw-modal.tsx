"use client";

import { useState } from "react";
import { MethodTile } from "@/components/dashboard/funds/method-tile";
import { CryptoWithdrawScreen } from "@/components/dashboard/funds/crypto-withdraw-screen";
import { BankWithdrawScreen } from "@/components/dashboard/funds/bank-withdraw-screen";
import { SwapIcon, BankIcon } from "@/components/ui/icons";

type Step = "chooser" | "crypto" | "bank";

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("chooser");
  const back = () => setStep("chooser");

  if (step === "crypto") return <CryptoWithdrawScreen onBack={back} />;
  if (step === "bank") return <BankWithdrawScreen onBack={back} />;

  return (
    <div>
      <div className="ws-serif text-[24px] tracking-[-0.01em]">Withdraw</div>
      <p className="mt-2 text-[13.5px] leading-normal font-normal text-white/65">
        Choose where you want your funds to go.
      </p>
      <div className="mt-[18px] flex flex-col gap-2">
        <MethodTile
          icon={<SwapIcon size={22} />}
          title="To external wallet"
          subtitle="Send any token you hold to a wallet on its network."
          badge="Popular"
          onClick={() => setStep("crypto")}
        />
        <MethodTile
          icon={<BankIcon size={22} />}
          title="To bank"
          subtitle="Cash out to your bank in naira."
          badge="Soon"
          onClick={() => setStep("bank")}
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
