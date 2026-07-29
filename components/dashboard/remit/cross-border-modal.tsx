"use client";

import { useState } from "react";
import { DestinationStep } from "@/components/dashboard/remit/destination-step";
import { RecipientStep } from "@/components/dashboard/remit/recipient-step";
import { AmountStep } from "@/components/dashboard/remit/amount-step";
import { ReviewStep } from "@/components/dashboard/remit/review-step";
import {
  EMPTY_REMIT_FORM,
  type RemitForm,
  type RemitStep,
} from "@/components/dashboard/remit/remit-types";
import type { PayoutCountry, PayoutMethodId, MobileNetwork } from "@/lib/cross-border";

// The cross-border send flow. Owns the wizard step and the collected form, and
// hands each step exactly the slice it needs. Kept as the one stateful piece so
// the step components stay presentational and testable.
export function CrossBorderModal() {
  const [step, setStep] = useState<RemitStep>("destination");
  const [form, setForm] = useState<RemitForm>(EMPTY_REMIT_FORM);

  const setCountry = (country: PayoutCountry) =>
    // A new country can invalidate the chosen network, so clear it.
    setForm((f) => ({ ...f, country, network: null }));
  const setMethod = (method: PayoutMethodId) => setForm((f) => ({ ...f, method }));
  const setNetwork = (network: MobileNetwork) => setForm((f) => ({ ...f, network }));
  const setField = (field: "recipientName" | "accountNumber" | "bankName", value: string) =>
    setForm((f) => ({ ...f, [field]: value }));
  const setAmount = (amountUsd: string) => setForm((f) => ({ ...f, amountUsd }));

  if (step === "recipient" && form.country && form.method) {
    return (
      <RecipientStep
        country={form.country}
        method={form.method}
        network={form.network}
        recipientName={form.recipientName}
        accountNumber={form.accountNumber}
        bankName={form.bankName}
        onField={setField}
        onBack={() => setStep("destination")}
        onNext={() => setStep("amount")}
      />
    );
  }

  if (step === "amount" && form.country) {
    return (
      <AmountStep
        country={form.country}
        amountUsd={form.amountUsd}
        onAmount={setAmount}
        onBack={() => setStep("recipient")}
        onNext={() => setStep("review")}
      />
    );
  }

  if (step === "review") {
    return <ReviewStep form={form} onBack={() => setStep("amount")} />;
  }

  return (
    <DestinationStep
      country={form.country}
      method={form.method}
      network={form.network}
      onCountry={setCountry}
      onMethod={setMethod}
      onNetwork={setNetwork}
      onNext={() => setStep("recipient")}
    />
  );
}
