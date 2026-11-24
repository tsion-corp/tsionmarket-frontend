"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/ui/sheet-nav";
import { useModalScreen } from "@/components/ui/modal-shell";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { FormFeedback, asError, type Feedback } from "@/components/ui/form-feedback";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { paycrestReference, useCreatePaycrestOnramp, usePaycrestOrder } from "@/hooks/use-paycrest";
import { copyText } from "@/lib/clipboard";
import { MASK_ATTRIBUTE } from "@/lib/analytics/clarity";
import { friendlyError } from "@/lib/errors";
import { formatUnits, groupDecimal, parseUnits } from "@/lib/paycrest/amounts";
import {
  paycrestProgress,
  type PaycrestFiatDeposit,
  type PaycrestIdType,
  type PaycrestOrder,
} from "@/lib/paycrest/types";
import { isAdult } from "@/lib/paycrest/kyc";
import { DateField } from "@/features/funds/components/kyc/date-field";
import {
  PaycrestAccountField,
  type ResolvedAccount,
} from "@/features/funds/components/paycrest-account-field";

const FIAT = "NGN";
const FIAT_DECIMALS = 2;
const AMOUNT_INPUT = /^\d*\.?\d{0,2}$/;
const ID_DIGITS = 11; // BVN and NIN

const BOX =
  "focus-within:border-accent/45 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-[#1b1b1b] px-4 py-3.5 transition-colors";
const INPUT =
  "w-full bg-transparent font-sans text-[14px] text-white outline-none placeholder:text-white/40";

function naira(text: string): string {
  return `₦${groupDecimal(text)}`;
}

// Add USDC on Base from a Nigerian bank over Paycrest. Paycrest requires the
// customer's KYC on every deposit: the verified name on their own refund
// account is the KYC full name (Paycrest rejects a mismatch anyway), plus date
// of birth and BVN or NIN. These are sent with the order and never stored.
// The order returns a virtual account; the user pays the exact amount into it
// and the USDC arrives in their wallet.
export function PaycrestDepositScreen({ onBack }: { onBack: () => void }) {
  const t = useTranslations("paycrest");
  useModalScreen({ back: onBack, fullScreen: true });
  const { evmAddress } = useAuthSession();
  const { refetch: refetchPortfolio } = usePortfolio();
  const create = useCreatePaycrestOnramp();

  const [amountInput, setAmountInput] = useState("");
  const [account, setAccount] = useState<ResolvedAccount | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [idType, setIdType] = useState<PaycrestIdType>("BVN");
  const [idNumber, setIdNumber] = useState("");
  const [order, setOrder] = useState<PaycrestOrder | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const status = usePaycrestOrder(order?.id ?? null, "onramp");
  const live = status.data ?? order;

  const amountUnits = parseUnits(amountInput || "0", FIAT_DECIMALS) ?? 0n;
  const adult = isAdult(birthDate);
  const idValid = idNumber.length === ID_DIGITS;
  const ready =
    amountUnits > 0n &&
    Boolean(account) &&
    adult &&
    idValid &&
    Boolean(evmAddress) &&
    !create.isPending;

  const submit = async () => {
    if (!ready || !account) return;
    setFeedback(null);
    try {
      const created = await create.mutateAsync({
        amount: formatUnits(amountUnits, FIAT_DECIMALS),
        token: "USDC",
        currency: FIAT,
        refundAccount: {
          institution: account.institution,
          accountIdentifier: account.accountIdentifier,
          accountName: account.accountName,
        },
        kyc: { fullName: account.accountName, birthDate, idType, idNumber },
        reference: paycrestReference("onramp"),
      });
      if (created.deposit?.kind !== "fiat") {
        setFeedback(asError(t("unexpectedDeposit")));
        return;
      }
      // The ID number has done its job; drop it from memory.
      setIdNumber("");
      setOrder(created);
    } catch (e) {
      setFeedback(asError(friendlyError(e, t("createFailed"))));
    }
  };

  // The deposit instructions stay on screen for the life of the order. The
  // first response carries them; later polls may not, so keep the first.
  const deposit = order?.deposit?.kind === "fiat" ? order.deposit : null;
  if (live && deposit) {
    const progress = paycrestProgress(live.status, "onramp");
    return (
      <DepositInstructions
        deposit={deposit}
        progress={progress}
        statusError={status.isError}
        usdc={live.amount}
        onFinish={() => {
          refetchPortfolio();
          onBack();
        }}
      />
    );
  }

  return (
    <div>
      <SheetNav title={t("depositTitle")} subtitle={t("depositSubtitle")} />

      <div className="mt-6 rounded-2xl border border-white/15 bg-[#1b1b1b] px-5 pt-4 pb-5">
        <div className="mb-3 text-[13.5px] font-medium text-white/50">{t("amountNgn")}</div>
        <input
          inputMode="decimal"
          value={amountInput}
          aria-label={t("amountNgn")}
          disabled={create.isPending}
          onChange={(e) => {
            const raw = e.target.value.replace(/,/g, "");
            if (AMOUNT_INPUT.test(raw)) {
              setFeedback(null);
              setAmountInput(raw);
            }
          }}
          placeholder="0"
          className="ws-display tnum w-full border-none bg-transparent text-[38px] text-white outline-none placeholder:text-white/40"
        />
      </div>

      <div className="mt-6 text-[13px] font-medium text-white/70">{t("yourAccount")}</div>
      <p className="mt-1 mb-3 text-[12px] leading-[1.5] text-white/45">{t("yourAccountHint")}</p>
      <PaycrestAccountField currency={FIAT} onChange={setAccount} disabled={create.isPending} />

      <div className="mt-6 text-[13px] font-medium text-white/70">{t("identity")}</div>
      <p className="mt-1 mb-3 text-[12px] leading-[1.5] text-white/45">{t("identityHint")}</p>
      <div className="flex flex-col gap-3">
        <DateField
          label={t("birthDate")}
          required
          value={birthDate}
          error={birthDate && !adult ? t("mustBeAdult") : null}
          onChange={setBirthDate}
          disabled={create.isPending}
        />
        <div className="flex gap-2" role="radiogroup" aria-label={t("idType")}>
          {(["BVN", "nationalID"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={idType === type}
              onClick={() => setIdType(type)}
              className={`flex-1 cursor-pointer rounded-full border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                idType === type
                  ? "border-white/60 bg-white/10 text-white"
                  : "border-white/12 text-white/55 hover:text-white/80"
              }`}
            >
              {type === "BVN" ? t("bvn") : t("nin")}
            </button>
          ))}
        </div>
        <label className={BOX}>
          <input
            {...MASK_ATTRIBUTE}
            inputMode="numeric"
            autoComplete="off"
            value={idNumber}
            disabled={create.isPending}
            onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, ID_DIGITS))}
            placeholder={idType === "BVN" ? t("bvnNumber") : t("ninNumber")}
            aria-label={idType === "BVN" ? t("bvnNumber") : t("ninNumber")}
            className={`tnum ${INPUT}`}
          />
        </label>
      </div>

      <FormFeedback feedback={feedback} />

      <button
        onClick={submit}
        disabled={!ready}
        className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white font-sans text-[15px] font-semibold text-[#181818] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {create.isPending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#181818]/30 border-t-[#181818]" />
            {t("processing")}
          </>
        ) : (
          t("getAccount")
        )}
      </button>
    </div>
  );
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const t = useTranslations("paycrest");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/8 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[12px] text-white/45">{label}</div>
        <div className="tnum mt-0.5 truncate text-[15px] font-medium text-white">
          {display ?? value}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("copy", { label })}
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="shrink-0 cursor-pointer rounded-full border border-white/12 p-2 text-white/70 hover:text-white"
      >
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </button>
    </div>
  );
}

function DepositInstructions({
  deposit,
  progress,
  statusError,
  usdc,
  onFinish,
}: {
  deposit: PaycrestFiatDeposit;
  progress: ReturnType<typeof paycrestProgress>;
  statusError: boolean;
  usdc: string;
  onFinish: () => void;
}) {
  const t = useTranslations("paycrest");
  const deadline = new Date(deposit.validUntil);
  const deadlineText = Number.isNaN(deadline.getTime())
    ? deposit.validUntil
    : deadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (
    progress === "paid" ||
    progress === "refunded" ||
    progress === "expired" ||
    progress === "failed"
  ) {
    const title =
      progress === "paid"
        ? t("depositPaidTitle")
        : progress === "refunded"
          ? t("refundedTitle")
          : t("expiredTitle");
    const body =
      progress === "paid"
        ? t("depositPaidBody", { amount: groupDecimal(usdc) })
        : progress === "refunded"
          ? t("depositRefundedBody")
          : t("depositExpiredBody");
    return (
      <div className="px-1 py-2 text-center">
        <span className="bg-accent/14 text-accent inline-grid h-[56px] w-[56px] place-items-center rounded-full">
          <CheckIcon size={26} />
        </span>
        <div className="ws-display mt-4 text-[21px]">{title}</div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] text-white/60">
          {body}
        </p>
        <button
          onClick={onFinish}
          className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-white font-sans text-[15px] font-semibold text-[#181818] hover:opacity-90"
        >
          {t("finish")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav title={t("payTitle")} subtitle={t("paySubtitle", { time: deadlineText })} />
      <div className="mt-6 rounded-2xl border border-white/15 bg-[#1b1b1b] px-5 py-2">
        <CopyRow
          label={t("payAmount")}
          value={deposit.amountToTransfer}
          display={naira(deposit.amountToTransfer)}
        />
        <CopyRow label={t("payAccountNumber")} value={deposit.accountIdentifier} />
        <CopyRow label={t("payBank")} value={deposit.institution} />
        <CopyRow label={t("payAccountName")} value={deposit.accountName} />
      </div>
      <p className="mt-3 text-[12.5px] leading-[1.55] text-white/55">
        {t("payExactNote", { usdc: groupDecimal(usdc) })}
      </p>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-white/55">{t("payOwnAccountNote")}</p>
      <div className="mt-6 flex items-center justify-center gap-3 text-[13px] text-white/55">
        <span
          role="status"
          aria-label={t("waitingForPayment")}
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[#7ce7b0]"
        />
        {progress === "processing" ? t("paymentReceived") : t("waitingForPayment")}
      </div>
      {statusError ? (
        <p className="mt-2 text-center text-[12.5px] text-white/45">{t("statusUnavailable")}</p>
      ) : null}
      <button
        onClick={onFinish}
        className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 font-sans text-[15px] font-semibold text-white hover:bg-white/10"
      >
        {t("done")}
      </button>
    </div>
  );
}
