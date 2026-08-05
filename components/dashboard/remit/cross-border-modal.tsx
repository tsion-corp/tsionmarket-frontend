"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DestinationStep } from "@/components/dashboard/remit/destination-step";
import { StatusStep } from "@/components/dashboard/remit/status-step";
import {
  clearPendingRemit,
  isPendingRemitActive,
  pendingRemitSnapshot,
  serverPendingRemitSnapshot,
  subscribePendingRemit,
} from "@/lib/payment/pending";
import { RecipientStep } from "@/components/dashboard/remit/recipient-step";
import { AmountStep } from "@/components/dashboard/remit/amount-step";
import { ReviewStep } from "@/components/dashboard/remit/review-step";
import {
  EMPTY_REMIT_FORM,
  type RemitForm,
  type RemitStep,
} from "@/components/dashboard/remit/remit-types";
import type { PayoutCountry, PayoutMethodId, MobileNetwork } from "@/lib/cross-border";
import type { PayoutBank } from "@/lib/payment/offramp";

// The cross-border send flow. Owns the wizard step and the collected form, and
// hands each step exactly the slice it needs. Kept as the one stateful piece so
// the step components stay presentational and testable.
export function CrossBorderModal() {
  const [step, setStep] = useState<RemitStep>("destination");
  const [form, setForm] = useState<RemitForm>(EMPTY_REMIT_FORM);
  // An order from a previous session that is still in flight. Only a funded
  // one is worth resuming — money moved; an unfunded leftover (a crash between
  // creating and paying) is silently released, nothing left the wallet.
  const pending = useSyncExternalStore(
    subscribePendingRemit,
    pendingRemitSnapshot,
    serverPendingRemitSnapshot
  );
  const [resumeDismissed, setResumeDismissed] = useState(false);

  // TTL and stale-unfunded enforcement live against the store, not in render
  // (same shape as usePendingOnramp): the effect drops a dead record, the
  // store notifies, and the render re-reads null. The mount instant guards the
  // unfunded case so an order being created RIGHT NOW in the review step is
  // never swept mid-flight.
  const mountedAtRef = useRef(0);
  useEffect(() => {
    if (mountedAtRef.current === 0) mountedAtRef.current = Date.now();
    if (!pending) return;
    const stale = !pending.funded && pending.createdAt < mountedAtRef.current;
    if (stale || !isPendingRemitActive(pending, Date.now())) clearPendingRemit();
  }, [pending]);

  const resumable = !resumeDismissed && pending?.funded ? pending : null;

  const reset = () => {
    setForm(EMPTY_REMIT_FORM);
    setStep("destination");
  };

  const setCountry = (country: PayoutCountry) =>
    // A new country invalidates the chosen network and bank, so clear both.
    setForm((f) => ({ ...f, country, network: null, bank: null }));
  const setMethod = (method: PayoutMethodId) => setForm((f) => ({ ...f, method }));
  const setBank = (bank: PayoutBank) => setForm((f) => ({ ...f, bank, verifiedAccountName: null }));
  const setNetwork = (network: MobileNetwork) => setForm((f) => ({ ...f, network }));
  const setField = (
    field: "recipientName" | "accountNumber" | "recipientPhone" | "senderName" | "senderPhone",
    value: string
  ) =>
    setForm((f) => ({
      ...f,
      [field]: value,
      // Editing the payout target invalidates a previously verified holder.
      ...(field === "accountNumber" || field === "recipientPhone"
        ? { verifiedAccountName: null }
        : {}),
    }));
  const setVerified = (name: string | null) =>
    setForm((f) => ({ ...f, verifiedAccountName: name }));
  const setAmount = (amountUsd: string) => setForm((f) => ({ ...f, amountUsd }));

  if (resumable) {
    return <StatusStep orderId={resumable.orderId} onExit={() => setResumeDismissed(true)} />;
  }

  if (step === "recipient" && form.country && form.method) {
    return (
      <RecipientStep
        country={form.country}
        method={form.method}
        network={form.network}
        recipientName={form.recipientName}
        accountNumber={form.accountNumber}
        bank={form.bank}
        recipientPhone={form.recipientPhone}
        onBank={setBank}
        onField={setField}
        onVerified={setVerified}
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
    return (
      <ReviewStep form={form} onField={setField} onBack={() => setStep("amount")} onDone={reset} />
    );
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
